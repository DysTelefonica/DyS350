import { SPHttpClient } from "@microsoft/sp-http";
import { WebPartContext } from "@microsoft/sp-webpart-base";
import { sp } from "@pnp/sp";

const escapeODataSingleQuoted = (value: string): string =>
  String(value || "").replace(/'/g, "''");

const decodePathSegments = (path: string): string => {
  const trimmed = String(path || "").trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  const joined = trimmed
    .split("/")
    .map((segment) => {
      if (!segment || !/%[0-9A-Fa-f]{2}/.test(segment)) return segment;
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
  return joined.charAt(0) === "/" ? joined : `/${joined}`;
};

/** Convierte UrlDocumento (absoluta o relativa) a ruta server-relative válida para la API de SharePoint. */
export const resolveServerRelativeDocumentUrl = (
  rawUrl: string,
  webServerRelativeUrl: string,
): string => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  const webPath = webServerRelativeUrl.replace(/\/$/, "");

  if (/^\/https?:\/\//i.test(trimmed)) {
    return resolveServerRelativeDocumentUrl(trimmed.slice(1), webServerRelativeUrl);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const pathname = decodeURIComponent(new URL(trimmed).pathname).replace(
        /\/+$/,
        "",
      );
      return decodePathSegments(
        pathname.charAt(0) === "/" ? pathname : `/${pathname}`,
      );
    } catch {
      return "";
    }
  }

  let pathname = trimmed.replace(/\/+$/, "");
  if (pathname.charAt(0) !== "/") {
    pathname = `${webPath}/${pathname.replace(/^\/+/, "")}`.replace(/\/+$/, "");
  }

  if (
    webPath &&
    pathname.toLowerCase().indexOf(webPath.toLowerCase()) !== 0 &&
    (/\/documentaciontrabajo\//i.test(pathname) ||
      /\/documentacionarchivo\//i.test(pathname))
  ) {
    return decodePathSegments(`${webPath}${pathname}`);
  }

  return decodePathSegments(pathname);
};

const DOCUMENT_METADATA_FIELDS = [
  "TituloDocumento",
  "NombreDocumento",
  "TipologiaDocumental",
  "NumeroDocumento",
  "VersionDocumento",
  "OrdinalE2E",
  "IDTipo",
  "IDDocumento",
  "IDExpedienteDocumento",
  "Nemotecnico",
  "CodExp",
] as const;

const readFileListItemMetadata = async (
  serverRelativeUrl: string,
): Promise<Record<string, unknown>> => {
  try {
    const fileItem = await sp.web
      .getFileByServerRelativeUrl(serverRelativeUrl)
      .getItem();
    const fields = await fileItem.select(...DOCUMENT_METADATA_FIELDS).get();
    const metadata: Record<string, unknown> = {};
    DOCUMENT_METADATA_FIELDS.forEach((field) => {
      const val = fields[field];
      if (val !== null && val !== undefined && val !== "") {
        metadata[field] = val;
      }
    });
    return metadata;
  } catch (e) {
    console.error("Error leyendo metadatos del documento:", e);
    return {};
  }
};

/** Sube un fichero local reemplazando el documento de la tarea y conservando metadatos. */
export const replaceTaskDocumentFile = async (
  context: WebPartContext,
  replaceFileServerRelativeUrl: string,
  uploadFile: File,
): Promise<string> => {
  const webServerRelativeUrl = context.pageContext.web.serverRelativeUrl.replace(
    /\/$/,
    "",
  );
  const normalizedReplaceFileUrl = resolveServerRelativeDocumentUrl(
    replaceFileServerRelativeUrl,
    webServerRelativeUrl,
  );
  if (!normalizedReplaceFileUrl) {
    throw new Error("No se ha podido determinar el documento de la tarea.");
  }

  const folderPath = resolveServerRelativeDocumentUrl(
    normalizedReplaceFileUrl.replace(/\/[^/]+$/, ""),
    webServerRelativeUrl,
  );
  const targetFileName = uploadFile.name.trim();
  if (!targetFileName) {
    throw new Error("El archivo seleccionado no tiene un nombre válido.");
  }

  const newFileUrl = resolveServerRelativeDocumentUrl(
    `${folderPath}/${targetFileName}`,
    webServerRelativeUrl,
  );
  const preservedMetadata = await readFileListItemMetadata(
    normalizedReplaceFileUrl,
  );
  const webAbsoluteUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
  const endpoint = `${webAbsoluteUrl}/_api/web/GetFolderByServerRelativeUrl('${escapeODataSingleQuoted(
    folderPath,
  )}')/Files/Add(overwrite=true,url='${escapeODataSingleQuoted(
    targetFileName,
  )}')`;

  const response = await context.spHttpClient.post(
    endpoint,
    SPHttpClient.configurations.v1,
    {
      body: await uploadFile.arrayBuffer(),
      headers: {
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/octet-stream",
      },
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }

  if (Object.keys(preservedMetadata).length > 0) {
    const replacedFileItem = await sp.web
      .getFileByServerRelativeUrl(newFileUrl)
      .getItem();
    await replacedFileItem.update(preservedMetadata);
  }

  if (normalizedReplaceFileUrl !== newFileUrl) {
    try {
      await sp.web
        .getFileByServerRelativeUrl(normalizedReplaceFileUrl)
        .recycle();
    } catch (deleteErr) {
      console.warn("No se pudo eliminar el archivo anterior:", deleteErr);
    }
  }

  return newFileUrl;
};
