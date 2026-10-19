/**
 * Utilidades centralizadas para cierre de versión en DocumentacionArchivo.
 * Patrón de nomenclatura: {TT}-{ordinal}-{aa}-v{bb}-{nombreOriginal.ext}
 */

import { SPHttpClient } from "@microsoft/sp-http";
import { WebPartContext } from "@microsoft/sp-webpart-base";
import { sp } from "@pnp/sp";

export interface IArchiveFolderDocument {
  fileLeafRef: string;
  fileName: string;
  cleanOriginalFileName: string;
  cleanOriginalBase: string;
  numeroDocumento: number | null;
  versionDocumento: number | null;
  idTipo: number | null;
  nombreDocumento: string;
}

export interface ICloseVersionSuggestion {
  aa: string;
  version: string;
}

export interface IUniquenessValidationResult {
  valid: boolean;
  error?: string;
}

/** TT-XXXXXX-01-v01-nombre.ext (v/V case-insensitive) */
const NOMENCLATURE_FILE_PATTERN =
  /^[^-]+-[^-]+-(\d+)-[vV](\d+)-(.+)$/i;

export const escapeODataValue = (value: string): string =>
  value.replace(/'/g, "''");

export const parseNumericField = (value: unknown): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return isNaN(parsed) ? null : parsed;
};

export const formatSuggestedNumber = (n: number): string => {
  const rounded = Math.floor(n);
  return rounded === n ? String(n) : String(n).replace(".", ",");
};

export const splitFileNameParts = (
  fileName: string,
): { base: string; ext: string; fileName: string } => {
  const clean = String(fileName || "").trim();
  if (!clean) return { base: "", ext: "", fileName: "" };
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex <= 0) return { base: clean, ext: "", fileName: clean };
  return {
    base: clean.substring(0, dotIndex),
    ext: clean.substring(dotIndex),
    fileName: clean,
  };
};

/**
 * Elimina el prefijo de nomenclatura y devuelve el nombre original con extensión.
 */
export const stripNomenclatureFromFileName = (fileName: string): string => {
  const { fileName: leaf } = splitFileNameParts(
    fileName.split("/").pop() || fileName,
  );
  const match = leaf.match(NOMENCLATURE_FILE_PATTERN);
  if (match && match[3]) return match[3].trim();
  return leaf;
};

export const normalizeComparisonBase = (
  base: string,
  idDocumento?: number,
): string => {
  let normalized = String(base || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (idDocumento !== undefined && idDocumento !== null) {
    const suffix = `_${idDocumento}`;
    if (
      suffix.length > 0 &&
      normalized.length >= suffix.length &&
      normalized.slice(-suffix.length) === suffix
    ) {
      normalized = normalized.slice(0, -suffix.length);
    }
  }
  return normalized;
};

export const mapArchiveListItemToDocument = (
  item: Record<string, unknown>,
): IArchiveFolderDocument | null => {
  const fileRef = String(item.FileRef || item.FileLeafRef || "").trim();
  if (!fileRef) return null;
  const fileName = fileRef.split("/").pop() || fileRef;
  const cleanOriginalFileName = stripNomenclatureFromFileName(fileName);
  const { base: cleanOriginalBase } = splitFileNameParts(cleanOriginalFileName);
  const nombreDocumento = String(item.NombreDocumento || "").trim();

  return {
    fileLeafRef: fileRef,
    fileName,
    cleanOriginalFileName,
    cleanOriginalBase,
    numeroDocumento: parseNumericField(item.NumeroDocumento),
    versionDocumento: parseNumericField(item.VersionDocumento),
    idTipo: parseNumericField(item.IDTipo),
    nombreDocumento,
  };
};

export const namesMatchForVersioning = (
  mandatoryOriginalFileName: string,
  doc: IArchiveFolderDocument,
  idDocumento?: number,
): boolean => {
  const mandatoryClean = stripNomenclatureFromFileName(mandatoryOriginalFileName);
  const { base: mandatoryBase, fileName: mandatoryFull } =
    splitFileNameParts(mandatoryClean);
  const mandatoryBaseNorm = normalizeComparisonBase(
    mandatoryBase,
    idDocumento,
  );
  const docBaseNorm = normalizeComparisonBase(doc.cleanOriginalBase, idDocumento);

  if (mandatoryBaseNorm && docBaseNorm && mandatoryBaseNorm === docBaseNorm) {
    return true;
  }

  if (
    mandatoryFull.toLowerCase() === doc.cleanOriginalFileName.toLowerCase()
  ) {
    return true;
  }

  const nombreMeta = String(doc.nombreDocumento || "").trim();
  if (nombreMeta) {
    const metaBase = normalizeComparisonBase(
      splitFileNameParts(nombreMeta).base,
      idDocumento,
    );
    if (mandatoryBaseNorm && metaBase && mandatoryBaseNorm === metaBase) {
      return true;
    }
  }

  return false;
};

const maxNumeric = (values: Array<number | null | undefined>): number => {
  let max = 0;
  values.forEach((v) => {
    if (v !== null && v !== undefined && !isNaN(v) && v > max) {
      max = v;
    }
  });
  return max;
};

/**
 * Versión sugerida para un Número Documento (Aa) ya existente del mismo tipo.
 */
export const suggestVersionForDocumentNumber = (
  archiveDocs: IArchiveFolderDocument[],
  documentNumber: number,
  idTipo: number | undefined,
): string => {
  const matching = archiveDocs.filter((doc) => {
    if (doc.numeroDocumento !== documentNumber) return false;
    if (idTipo === undefined || idTipo === null) return true;
    return doc.idTipo === idTipo;
  });
  const next = maxNumeric(matching.map((d) => d.versionDocumento)) + 1;
  return formatSuggestedNumber(next > 0 ? next : 1);
};

/**
 * Calcula Aa y versión por defecto según nombre limpio y tipo documental.
 */
export const suggestCloseVersionDefaults = (
  archiveDocs: IArchiveFolderDocument[],
  mandatoryOriginalFileName: string,
  idTipo: number | undefined,
  idDocumento?: number,
): ICloseVersionSuggestion => {
  const mandatoryName = String(mandatoryOriginalFileName || "").trim();
  if (!mandatoryName) {
    return { aa: "1", version: "1" };
  }

  const sameNameDocs = archiveDocs.filter((doc) =>
    namesMatchForVersioning(mandatoryName, doc, idDocumento),
  );

  if (sameNameDocs.length > 0) {
    const docWithMaxVersion = sameNameDocs.reduce<
      IArchiveFolderDocument | undefined
    >((best, current) => {
      if (!best) return current;
      const bestV = best.versionDocumento ?? 0;
      const curV = current.versionDocumento ?? 0;
      return curV >= bestV ? current : best;
    }, undefined);
    const maxVersion = maxNumeric(sameNameDocs.map((d) => d.versionDocumento));
    const aaValue = docWithMaxVersion?.numeroDocumento ?? 1;
    return {
      aa: formatSuggestedNumber(aaValue),
      version: formatSuggestedNumber(maxVersion + 1),
    };
  }

  if (idTipo !== undefined && idTipo !== null) {
    const sameTypeDocs = archiveDocs.filter((doc) => doc.idTipo === idTipo);
    if (sameTypeDocs.length > 0) {
      const maxAa = maxNumeric(sameTypeDocs.map((d) => d.numeroDocumento));
      return {
        aa: formatSuggestedNumber(maxAa + 1),
        version: "1",
      };
    }
  }

  return { aa: "1", version: "1" };
};

/**
 * Si el usuario introduce Aa manualmente: siguiente versión para ese Aa+tipo.
 */
export const suggestVersionForManualAa = (
  archiveDocs: IArchiveFolderDocument[],
  manualAa: string,
  idTipo: number | undefined,
): string => {
  const aaNum = parseNumericField(manualAa);
  if (aaNum === null) return "1";
  return suggestVersionForDocumentNumber(archiveDocs, aaNum, idTipo);
};

/**
 * Regla 4: mismo Aa + versión + tipo + carpeta (carpeta implícita en el listado).
 */
export const validateArchiveDocumentUniqueness = (
  archiveDocs: IArchiveFolderDocument[],
  aa: string,
  version: string,
  idTipo: number | undefined,
): IUniquenessValidationResult => {
  const aaNum = parseNumericField(aa);
  const versionNum = parseNumericField(version);

  if (aaNum === null) {
    return { valid: false, error: "El Número Documento no es válido." };
  }
  if (versionNum === null) {
    return { valid: false, error: "La versión no es válida." };
  }

  const duplicate = archiveDocs.some((doc) => {
    if (doc.numeroDocumento !== aaNum || doc.versionDocumento !== versionNum) {
      return false;
    }
    if (idTipo === undefined || idTipo === null) return true;
    return doc.idTipo === idTipo;
  });

  if (duplicate) {
    return {
      valid: false,
      error: `Ya existe un documento en esta carpeta con Número Documento ${aa}, versión ${version} y el mismo tipo documental. No se puede guardar un duplicado.`,
    };
  }

  return { valid: true };
};

const toAbsoluteSharePointUrl = (
  serverRelativeOrAbsoluteUrl: string,
  webAbsoluteUrl: string,
): string => {
  const trimmed = String(serverRelativeOrAbsoluteUrl || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = new URL(webAbsoluteUrl).origin;
  // @ts-ignore
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
};

/**
 * Copia un fichero poniendo origen/destino en el body (CopyFileByPath),
 * evitando el 400 maxUrlLength de copyTo con rutas largas o caracteres especiales.
 * Si falla, descarga el binario y lo sube con Files/Add.
 */
export const copyFileAvoidingMaxUrlLength = async (
  context: WebPartContext,
  sourceServerRelativeUrl: string,
  destFolderServerRelativeUrl: string,
  destFileName: string,
  overwrite = true,
): Promise<string> => {
  const webAbsoluteUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
  const sourceUrl = String(sourceServerRelativeUrl || "").trim().replace(/\/+$/, "");
  const destFolder = String(destFolderServerRelativeUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const leaf = String(destFileName || "").trim();
  if (!sourceUrl || !destFolder || !leaf) {
    throw new Error("Ruta de origen o destino no válida para la copia.");
  }

  const destFileUrl = `${destFolder}/${leaf}`;

  const copyByPathEndpoint = `${webAbsoluteUrl}/_api/SP.MoveCopyUtil.CopyFileByPath()`;
  const copyByPathBody = {
    srcPath: {
      DecodedUrl: toAbsoluteSharePointUrl(sourceUrl, webAbsoluteUrl),
    },
    destPath: {
      DecodedUrl: toAbsoluteSharePointUrl(destFileUrl, webAbsoluteUrl),
    },
    overwrite,
    options: {
      KeepBoth: false,
      ResetAuthorAndCreatedOnCopy: false,
      ShouldBypassSharedLocks: true,
    },
  };

  const copyByPathResponse = await context.spHttpClient.post(
    copyByPathEndpoint,
    SPHttpClient.configurations.v1,
    {
      headers: {
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/json;odata=verbose",
        "odata-version": "",
      },
      body: JSON.stringify(copyByPathBody),
    },
  );

  if (copyByPathResponse.ok) {
    return destFileUrl;
  }

  const copyByPathDetail = await copyByPathResponse.text();
  console.warn(
    "CopyFileByPath falló; se intenta copia por descarga/subida:",
    copyByPathDetail,
  );

  // Fallback: solo una ruta en cada request (origen en GET, carpeta+nombre en POST).
  const fileBuffer = await sp.web
    .getFileByServerRelativeUrl(sourceUrl)
    .getBuffer();

  const uploadEndpoint = `${webAbsoluteUrl}/_api/web/GetFolderByServerRelativeUrl('${escapeODataValue(
    destFolder,
  )}')/Files/Add(overwrite=${overwrite ? "true" : "false"},url='${escapeODataValue(
    leaf,
  )}')`;

  const uploadResponse = await context.spHttpClient.post(
    uploadEndpoint,
    SPHttpClient.configurations.v1,
    {
      body: fileBuffer,
      headers: {
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/octet-stream",
      },
    },
  );

  if (!uploadResponse.ok) {
    const uploadDetail = await uploadResponse.text();
    throw new Error(
      uploadDetail ||
        copyByPathDetail ||
        `No se pudo copiar el fichero (HTTP ${uploadResponse.status}).`,
    );
  }

  return destFileUrl;
};

/**
 * Renombra/mueve un fichero con rutas en el body (MoveFileByPath),
 * evitando el 400 maxUrlLength de moveTo con rutas largas.
 * Si falla: sube con el nuevo nombre y recicla el original.
 */
export const moveFileAvoidingMaxUrlLength = async (
  context: WebPartContext,
  sourceServerRelativeUrl: string,
  destFolderServerRelativeUrl: string,
  destFileName: string,
  overwrite = true,
): Promise<string> => {
  const webAbsoluteUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
  const sourceUrl = String(sourceServerRelativeUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const destFolder = String(destFolderServerRelativeUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const leaf = String(destFileName || "").trim();
  if (!sourceUrl || !destFolder || !leaf) {
    throw new Error("Ruta de origen o destino no válida para el renombrado.");
  }

  const destFileUrl = `${destFolder}/${leaf}`;
  if (sourceUrl === destFileUrl) return destFileUrl;

  const moveByPathEndpoint = `${webAbsoluteUrl}/_api/SP.MoveCopyUtil.MoveFileByPath()`;
  const moveByPathBody = {
    srcPath: {
      DecodedUrl: toAbsoluteSharePointUrl(sourceUrl, webAbsoluteUrl),
    },
    destPath: {
      DecodedUrl: toAbsoluteSharePointUrl(destFileUrl, webAbsoluteUrl),
    },
    overwrite,
    options: {
      KeepBoth: false,
      RetainEditorAndModifiedOnMove: true,
      ShouldBypassSharedLocks: true,
    },
  };

  const moveByPathResponse = await context.spHttpClient.post(
    moveByPathEndpoint,
    SPHttpClient.configurations.v1,
    {
      headers: {
        Accept: "application/json;odata=nometadata",
        "Content-Type": "application/json;odata=verbose",
        "odata-version": "",
      },
      body: JSON.stringify(moveByPathBody),
    },
  );

  if (moveByPathResponse.ok) {
    return destFileUrl;
  }

  const moveByPathDetail = await moveByPathResponse.text();
  console.warn(
    "MoveFileByPath falló; se intenta renombrado por copia+reciclado:",
    moveByPathDetail,
  );

  const copiedUrl = await copyFileAvoidingMaxUrlLength(
    context,
    sourceUrl,
    destFolder,
    leaf,
    overwrite,
  );

  try {
    await sp.web.getFileByServerRelativeUrl(sourceUrl).recycle();
  } catch (recycleErr) {
    console.warn(
      "Documento renombrado por copia, pero no se pudo reciclar el original:",
      recycleErr,
    );
  }

  return copiedUrl;
};
