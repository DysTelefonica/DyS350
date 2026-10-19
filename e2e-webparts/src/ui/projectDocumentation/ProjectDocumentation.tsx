// @ts-nocheck
import * as React from "react";
import { SPHttpClient } from "@microsoft/sp-http";
import { IProjectDocumentationProps } from "./IProjectDocumentation";
import styles from "./ProjectDocumentation.module.scss";
import { sp } from "@pnp/sp";

interface IFolderNode {
  name: string;
  serverRelativeUrl: string;
  children?: IFolderNode[];
}

interface IFileItem {
  name: string;
  serverRelativeUrl: string;
  timeLastModified?: string;
  numeroDocumento?: number;
  versionDocumento?: number;
  tituloDocumento?: string;
  idDocumento?: number;
}
interface IDocumentSearchFilters {
  idExpedienteDocumento: string;
  tituloDocumento: string;
  nombreDocumento: string;
  nombreArchivo: string;
  tipologiaDocumental: string;
  numeroDocumento: string;
  versionDocumento: string;
}
interface IDocumentSearchResult {
  id: number;
  idExpedienteDocumento: string;
  tituloDocumento: string;
  nombreDocumento: string;
  tipologiaDocumental: string;
  numeroDocumento: string;
  versionDocumento: string;
  fileName: string;
  path: string;
  idDocumento?: number;
}
interface ISearchTipoDocumentoOption {
  Id: number;
  IDTipoDocumento: number;
  title: string;
  acronimo: string;
}
interface IGrupoDocumentoOption {
  idCarpeta: number;
  title: string;
}
interface ICarpetaExpedienteItem {
  idCarpeta: number;
  title: string;
  idPadre: unknown;
}
const SEARCH_PROPS = {
  idExpedienteDocumento: "RefinableInt01",
  tituloDocumento: "RefinableString10",
  nombreDocumento: "RefinableString11",
  tipologiaDocumental: "RefinableString102",
  numeroDocumento: "RefinableString13",
  versionDocumento: "RefinableString100",
};
const parseSharePointNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value !== null && "Id" in value) {
    return parseSharePointNumber((value as { Id?: unknown }).Id);
  }
  const parsed = Number(String(value).trim().replace(",", "."));
  return isNaN(parsed) ? null : parsed;
};
const isIdPadreEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "object") return false;
  const raw = String(value).trim();
  return !raw || raw === "0";
};
const mapCarpetaExpedienteItem = (item: any): ICarpetaExpedienteItem | null => {
  const idCarpeta = parseSharePointNumber(item?.IDCarpeta ?? item?.Id);
  const title = String(item?.Title || "").trim();
  if (idCarpeta === null || !title) return null;
  return {
    idCarpeta,
    title,
    idPadre: item?.IDPadre,
  };
};
const escapeKqlValue = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/"/g, '""');

/**
 * Asegura rutas server-relative con el mismo formato que SharePoint (Unicode real).
 * Si algún segmento llega como %XX (p. ej. %C3%8D), lo decodifica para evitar
 * desajustes con getFolderByServerRelativePath / subida de ficheros.
 */
const normalizeServerRelativePath = (path: string): string => {
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
  return joined.startsWith("/") ? joined : `/${joined}`;
};

const toServerRelativeDocumentUrl = (
  rawUrl: string,
  webServerRelativeUrl: string,
  webAbsoluteUrl: string,
): string => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  const webPath = webServerRelativeUrl.replace(/\/$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return normalizeServerRelativePath(decodeURIComponent(parsed.pathname));
    } catch {
      return "";
    }
  }

  if (trimmed.startsWith("/")) {
    const normalized = normalizeServerRelativePath(trimmed);
    if (
      webPath &&
      !normalized.toLowerCase().startsWith(webPath.toLowerCase()) &&
      (/\/documentaciontrabajo\//i.test(normalized) ||
        /\/documentacionarchivo\//i.test(normalized))
    ) {
      return normalizeServerRelativePath(`${webPath}${normalized}`);
    }
    return normalized;
  }

  return normalizeServerRelativePath(
    `${webPath}/${trimmed.replace(/^\/+/, "")}`,
  );
};

const buildDocumentUrlCandidates = (
  rawUrl: string,
  webServerRelativeUrl: string,
  webAbsoluteUrl: string,
): string[] => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return [];

  const candidates = new Set<string>();
  const add = (value: string): void => {
    const normalized = normalizeServerRelativePath(String(value || "").trim());
    if (normalized) candidates.add(normalized);
  };

  add(trimmed);
  add(toServerRelativeDocumentUrl(trimmed, webServerRelativeUrl, webAbsoluteUrl));

  const webPath = webServerRelativeUrl.replace(/\/$/, "");
  const primary = toServerRelativeDocumentUrl(
    trimmed,
    webServerRelativeUrl,
    webAbsoluteUrl,
  );
  if (primary && webPath) {
    add(`${webPath}${primary.startsWith("/") ? primary : `/${primary}`}`);
  }
  if (trimmed.startsWith("/") && webPath) {
    const normalizedTrimmed = normalizeServerRelativePath(trimmed);
    if (!normalizedTrimmed.toLowerCase().startsWith(webPath.toLowerCase())) {
      add(`${webPath}${normalizedTrimmed}`);
    }
  }

  return [...candidates];
};

const getDocumentBaseName = (rawUrl: string): string => {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  const segment = trimmed.split("/").pop() || trimmed;
  try {
    return decodeURIComponent(segment.replace(/\+/g, " ")).toLowerCase();
  } catch {
    return segment.toLowerCase();
  }
};

/** Extrae el número inicial del nombre: "01 Carpeta", "02. Nombre", etc. */
const getFolderLeadingNumber = (name: string): number | null => {
  const match = String(name || "")
    .trim()
    .match(/^(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
};

const sortFoldersByLeadingNumber = (items: IFolderNode[]): IFolderNode[] =>
  [...items].sort((a, b) => {
    const na = getFolderLeadingNumber(a.name);
    const nb = getFolderLeadingNumber(b.name);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return String(a.name || "").localeCompare(String(b.name || ""), "es", {
      sensitivity: "base",
    });
  });

const pathsMatchForRestrict = (left: string, right: string): boolean => {
  const a = normalizeServerRelativePath(left).toLowerCase();
  const b = normalizeServerRelativePath(right).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const aName = a.split("/").pop() || "";
  const bName = b.split("/").pop() || "";
  return !!aName && aName === bName;
};

const escapeODataSingleQuoted = (value: string): string =>
  String(value || "").replace(/'/g, "''");

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
      .getFileByServerRelativeUrl(normalizeServerRelativePath(serverRelativeUrl))
      .getItem();
    const fields = await fileItem
      .select(...DOCUMENT_METADATA_FIELDS)
      .get();
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

/**
 * Deja el ítem de biblioteca sin metadatos funcionales tras una subida nueva.
 * Evita la promoción de propiedades del Office/PDF y restos de un overwrite.
 */
const clearFileListItemMetadata = async (
  serverRelativeUrl: string,
): Promise<void> => {
  const normalized = normalizeServerRelativePath(serverRelativeUrl);
  if (!normalized) return;
  try {
    const fileItem = await sp.web
      .getFileByServerRelativeUrl(normalized)
      .getItem();
    const clearData: Record<string, unknown> = {
      Title: "",
    };
    DOCUMENT_METADATA_FIELDS.forEach((field) => {
      clearData[field] = null;
    });
    await fileItem.update(clearData);
  } catch (e) {
    console.warn(
      "No se pudieron limpiar los metadatos del fichero subido:",
      normalized,
      e,
    );
  }
};

const LIBRARIES_WITH_FILE_METADATA = new Set([
  "DocumentacionTrabajo",
  "DocumentacionArchivo",
]);

const isDocumentacionSearchEnabled = (
  enabled: boolean,
  library: string,
  project: string | number | null | undefined,
): boolean =>
  !!enabled &&
  !!project &&
  (library === "DocumentacionTrabajo" || library === "DocumentacionArchivo");

const hasIdDocumentoValue = (item: any): boolean => {
  const raw = item?.IDDocumento;
  if (raw === null || raw === undefined || raw === "") return false;
  const parsed = Number(raw);
  return !Number.isNaN(parsed) && parsed > 0;
};

const getFileExtensionWithDot = (fileName: string): string => {
  const leaf = String(fileName || "").trim();
  const dot = leaf.lastIndexOf(".");
  if (dot <= 0) return "";
  return leaf.substring(dot);
};

/**
 * Prefijo de cierre de versión: TT-XXXXXX-AA-vBB(-)
 * El guion tras la versión es opcional: en archivo hay nombres tipo
 * `MA-000089-02-v01Manual...` (sin `-`) y `MA-000089-01-v01-Manuales...`.
 */
const NOMENCLATURE_PREFIX_PATTERN = /^([^-]+-[^-]+-\d+-[vV]\d+-?)/i;

/** Prefijo normalizado siempre con `-` final para mostrar / concatenar. */
const extractNomenclaturePrefix = (fileLeafName: string): string => {
  const leaf = String(fileLeafName || "").trim();
  if (!leaf) return "";
  const match = leaf.match(NOMENCLATURE_PREFIX_PATTERN);
  if (!match || !match[1]) return "";
  const raw = match[1];
  return raw.endsWith("-") ? raw : `${raw}-`;
};

/**
 * Nombre visible: TituloDocumento + extensión (fallback: FileLeafRef).
 * En DocumentacionArchivo antepone el patrón de nomenclatura del FileLeafRef.
 */
const buildDocumentDisplayName = (
  tituloDocumento: string | undefined | null,
  fileLeafName: string,
  options?: { includeNomenclaturePrefix?: boolean },
): string => {
  const leaf = String(fileLeafName || "").trim();
  const titulo = String(tituloDocumento || "").trim();
  const ext = getFileExtensionWithDot(leaf);
  const baseName = titulo ? `${titulo}${ext}` : leaf || "Abrir";
  if (!options?.includeNomenclaturePrefix) return baseName;

  const prefix = extractNomenclaturePrefix(leaf);
  if (!prefix) return baseName;

  // Cuerpo sin prefijo (cubre FileLeafRef sin `-` tras vBB).
  const bodyFromLeaf = leaf.replace(NOMENCLATURE_PREFIX_PATTERN, "").trim();
  const displayBody = titulo
    ? `${titulo}${ext}`
    : bodyFromLeaf || leaf || "Abrir";
  if (displayBody.toLowerCase().startsWith(prefix.toLowerCase())) {
    return displayBody;
  }
  return `${prefix}${displayBody}`;
};

/** Quita el sufijo `_IDDocumento` antes de .pdf (p. ej. Informe_59.pdf → Informe.pdf). */
const stripIdDocumentoFromFileName = (
  fileName: string,
  idDocumento?: number | null,
): string => {
  const leaf = String(fileName || "").trim();
  if (!leaf || idDocumento === null || idDocumento === undefined) return leaf;
  const idNum = Number(idDocumento);
  if (!Number.isFinite(idNum) || idNum <= 0) return leaf;
  const lower = leaf.toLowerCase();
  if (!lower.endsWith(".pdf")) return leaf;
  const dot = leaf.lastIndexOf(".");
  const base = dot > 0 ? leaf.substring(0, dot) : leaf;
  const ext = dot > 0 ? leaf.substring(dot) : "";
  const suffix = `_${idNum}`;
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) {
    return `${base.slice(0, -suffix.length)}${ext}`;
  }
  return leaf;
};

const buildDocumentDownloadFileName = (
  fileLeafName: string,
  idDocumento?: number | null,
  tituloDocumento?: string | null,
  options?: { includeNomenclaturePrefix?: boolean },
): string => {
  const leaf = String(fileLeafName || "").trim();
  const display = buildDocumentDisplayName(tituloDocumento, leaf, options);
  const lower = leaf.toLowerCase();
  if (lower.endsWith(".pdf")) {
    // Preferir quitar el id del nombre real del fichero; si no hay id, del display.
    const fromLeaf = stripIdDocumentoFromFileName(leaf, idDocumento);
    if (fromLeaf !== leaf) {
      // Conservar prefijo de nomenclatura visible si aplica.
      if (options?.includeNomenclaturePrefix) {
        const prefix = extractNomenclaturePrefix(leaf);
        const fromLeafNoPrefix = fromLeaf.replace(NOMENCLATURE_PREFIX_PATTERN, "");
        return prefix ? `${prefix}${fromLeafNoPrefix}` : fromLeaf;
      }
      return fromLeaf;
    }
    return stripIdDocumentoFromFileName(display, idDocumento);
  }
  return display || leaf || "documento";
};

const mapListItemToFileItem = (item: any): IFileItem | null => {
  const serverRelativeUrl = normalizeServerRelativePath(
    String(item.FileRef || "").trim(),
  );
  const name = String(
    item.FileLeafRef || serverRelativeUrl.split("/").pop() || "",
  ).trim();
  if (!serverRelativeUrl || !name) return null;
  const numeroDocumento = Number(item.NumeroDocumento);
  const versionDocumento = Number(item.VersionDocumento);
  const idDocumentoRaw = Number(item.IDDocumento);
  return {
    name,
    serverRelativeUrl,
    timeLastModified: item.Modified as string | undefined,
    numeroDocumento: Number.isNaN(numeroDocumento) ? undefined : numeroDocumento,
    versionDocumento: Number.isNaN(versionDocumento)
      ? undefined
      : versionDocumento,
    tituloDocumento: String(item.TituloDocumento || "").trim() || undefined,
    idDocumento:
      Number.isFinite(idDocumentoRaw) && idDocumentoRaw > 0
        ? idDocumentoRaw
        : undefined,
  };
};

const loadFilesFromLibraryFolder = async (
  listTitle: string,
  folderUrl: string,
): Promise<IFileItem[]> => {
  const normalizedFolderUrl = normalizeServerRelativePath(folderUrl);
  const items: any[] = await sp.web.lists
    .getByTitle(listTitle)
    .items.filter(
      `FileDirRef eq '${escapeODataSingleQuoted(normalizedFolderUrl)}' and FSObjType eq 0`,
    )
    .select(
      "FileRef",
      "FileLeafRef",
      "Modified",
      "NumeroDocumento",
      "VersionDocumento",
      "TituloDocumento",
      "IDDocumento",
      "FSObjType",
    )
    .top(5000)
    .getAll();

  return items
    .map(mapListItemToFileItem)
    .filter((file): file is IFileItem => file !== null);
};

const loadFolderFilesOnly = async (
  folderUrl: string,
): Promise<IFileItem[]> => {
  const folder = sp.web.getFolderByServerRelativePath(
    normalizeServerRelativePath(folderUrl),
  );
  const filesRes = await folder.files
    .select("Name,ServerRelativeUrl,TimeLastModified")
    .get();

  return filesRes.map((fl) => ({
    name: fl.Name as string,
    serverRelativeUrl: fl.ServerRelativeUrl as string,
    timeLastModified: fl.TimeLastModified as string,
  }));
};

const loadFilesByServerRelativeUrls = async (
  urls: string[],
  listTitle: string,
  webServerRelativeUrl: string,
  webAbsoluteUrl: string,
): Promise<IFileItem[]> => {
  const candidateUrls = [
    ...new Set(
      urls.flatMap((url) =>
        buildDocumentUrlCandidates(url, webServerRelativeUrl, webAbsoluteUrl),
      ),
    ),
  ];
  if (candidateUrls.length === 0) return [];

  const files: IFileItem[] = [];
  const loadedUrls = new Set<string>();

  for (const candidateUrl of candidateUrls) {
    if (loadedUrls.has(candidateUrl.toLowerCase())) continue;

    try {
      if (LIBRARIES_WITH_FILE_METADATA.has(listTitle)) {
        const file = await sp.web.getFileByServerRelativeUrl(candidateUrl);
        const fileItem = await file.getItem();
        const item = await fileItem
          .select(
            "FileRef",
            "FileLeafRef",
            "Modified",
            "NumeroDocumento",
            "VersionDocumento",
            "TituloDocumento",
            "IDDocumento",
          )
          .get();
        const mapped = mapListItemToFileItem(item);
        if (mapped) {
          files.push(mapped);
          loadedUrls.add(
            normalizeServerRelativePath(mapped.serverRelativeUrl).toLowerCase(),
          );
          continue;
        }
      }

      const file = await sp.web.getFileByServerRelativeUrl(candidateUrl);
      const props = await file
        .select("Name,ServerRelativeUrl,TimeLastModified")
        .get();
      const mappedUrl = normalizeServerRelativePath(
        String(props.ServerRelativeUrl || candidateUrl),
      );
      if (loadedUrls.has(mappedUrl.toLowerCase())) continue;
      files.push({
        name: props.Name as string,
        serverRelativeUrl: mappedUrl,
        timeLastModified: props.TimeLastModified as string | undefined,
      });
      loadedUrls.add(mappedUrl.toLowerCase());
    } catch (loadErr) {
      console.warn(`Error cargando archivo restringido ${candidateUrl}:`, loadErr);
    }
  }
  return files;
};

const filterFilesToRestrictedDocuments = (
  folderFiles: IFileItem[],
  rawRestrictUrls: string[],
  webServerRelativeUrl: string,
  webAbsoluteUrl: string,
): IFileItem[] => {
  const allowedCandidates = [
    ...new Set(
      rawRestrictUrls.flatMap((url) =>
        buildDocumentUrlCandidates(url, webServerRelativeUrl, webAbsoluteUrl),
      ),
    ),
  ];
  const allowedBasenames = new Set(
    rawRestrictUrls.map(getDocumentBaseName).filter(Boolean),
  );

  if (allowedCandidates.length === 0 && allowedBasenames.size === 0) {
    return folderFiles;
  }

  const matched = folderFiles.filter((file) => {
    if (
      allowedCandidates.some((allowedUrl) =>
        pathsMatchForRestrict(file.serverRelativeUrl, allowedUrl),
      )
    ) {
      return true;
    }
    const fileBaseName = getDocumentBaseName(file.name);
    return !!fileBaseName && allowedBasenames.has(fileBaseName);
  });

  return matched;
};

const loadLockedTaskDocuments = async (
  folderUrl: string,
  rawRestrictUrls: string[],
  listTitle: string,
  webServerRelativeUrl: string,
  webAbsoluteUrl: string,
): Promise<IFileItem[]> => {
  const dedupedRaw = [
    ...new Set(
      rawRestrictUrls.map((url) => String(url || "").trim()).filter(Boolean),
    ),
  ];

  const directFiles = await loadFilesByServerRelativeUrls(
    dedupedRaw,
    listTitle,
    webServerRelativeUrl,
    webAbsoluteUrl,
  );
  if (directFiles.length > 0) return directFiles;

  try {
    const folderFiles = LIBRARIES_WITH_FILE_METADATA.has(listTitle)
      ? await loadFilesFromLibraryFolder(listTitle, folderUrl)
      : await loadFolderFilesOnly(folderUrl);
    return filterFilesToRestrictedDocuments(
      folderFiles,
      dedupedRaw,
      webServerRelativeUrl,
      webAbsoluteUrl,
    );
  } catch (folderErr) {
    console.warn("Error cargando carpeta para documento de tarea:", folderErr);
    return [];
  }
};

const EMPTY_SELECTED_FILE_URLS: string[] = [];

const ProjectDocumentation: React.FC<IProjectDocumentationProps> = ({
  context,
  projectId,
  libraryName = "DocumentacionTrabajo",
  initialSelectedFileUrls = EMPTY_SELECTED_FILE_URLS,
  requiredFileUrl = null,
  singleSelection = false,
  selectable = true,
  allowUpload = false,
  enableSearchInDocumentacion = false,
  initialFolderServerRelativeUrl = null,
  lockToInitialFolder = false,
  replaceFileServerRelativeUrl = null,
  fileMetadataFallback = null,
  filterByIdTipo = null,
  latestVersionPerNumeroOnly = false,
  hideFolderPanel = false,
  hideDocumentNumberColumns = false,
  selectFilesOnly = false,
  restrictToFileUrls = EMPTY_SELECTED_FILE_URLS,
  onUploadComplete,
  onSelectionChange,
}) => {
  const isDestinationTipoFilterView =
    filterByIdTipo !== null &&
    filterByIdTipo !== undefined &&
    !Number.isNaN(Number(filterByIdTipo)) &&
    !!String(initialFolderServerRelativeUrl || "").trim();
  const isLockedFolderView =
    !!lockToInitialFolder &&
    !!String(initialFolderServerRelativeUrl || "").trim();
  const isSinglePanelView = isDestinationTipoFilterView || isLockedFolderView;
  const [folders, setFolders] = React.useState<IFolderNode[]>([]);
  const [currentPath, setCurrentPath] = React.useState<string[]>([]);
  const [files, setFiles] = React.useState<IFileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<
    Record<string, boolean>
  >({});
  const [error, setError] = React.useState<string>("");
  const [currentFolderUrl, setCurrentFolderUrl] = React.useState<string | null>(
    null,
  );
  const [isUploading, setIsUploading] = React.useState(false);
  const [downloadingFileUrl, setDownloadingFileUrl] = React.useState<string>("");
  const [filePendingDelete, setFilePendingDelete] =
    React.useState<IFileItem | null>(null);
  const [isDeletingFile, setIsDeletingFile] = React.useState(false);
  const [searchFilters, setSearchFilters] = React.useState<IDocumentSearchFilters>({
    idExpedienteDocumento: "",
    tituloDocumento: "",
    nombreDocumento: "",
    nombreArchivo: "",
    tipologiaDocumental: "",
    numeroDocumento: "",
    versionDocumento: "",
  });
  const [searchResults, setSearchResults] = React.useState<IDocumentSearchResult[]>(
    [],
  );
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [searchTiposCatalog, setSearchTiposCatalog] = React.useState<
    ISearchTipoDocumentoOption[]
  >([]);
  const [searchTiposFiltrados, setSearchTiposFiltrados] = React.useState<
    ISearchTipoDocumentoOption[]
  >([]);
  const [searchGruposDocumento, setSearchGruposDocumento] = React.useState<
    IGrupoDocumentoOption[]
  >([]);
  const [loadingSearchGrupos, setLoadingSearchGrupos] = React.useState(false);
  const [loadingSearchTipos, setLoadingSearchTipos] = React.useState(false);
  const [grupoDocumentoFilter, setGrupoDocumentoFilter] = React.useState("");
  const [tipoDocumentoIdFilter, setTipoDocumentoIdFilter] = React.useState("");

  const absolutePath = context.pageContext.web.serverRelativeUrl.replace(
    /\/$/,
    "",
  );
  const initialSelectedUrlsKey = initialSelectedFileUrls.join("\u001f");
  const webAbsoluteUrl = context.pageContext.web.absoluteUrl;
  const normalizedReplaceFileUrl = React.useMemo(
    () =>
      replaceFileServerRelativeUrl
        ? toServerRelativeDocumentUrl(
            replaceFileServerRelativeUrl,
            absolutePath,
            webAbsoluteUrl,
          )
        : "",
    [replaceFileServerRelativeUrl, absolutePath, webAbsoluteUrl],
  );
  const effectiveRestrictUrls = React.useMemo(() => {
    const urls = new Set<string>();
    const addUrl = (raw?: string | null): void => {
      const serverRelative = toServerRelativeDocumentUrl(
        String(raw || ""),
        absolutePath,
        webAbsoluteUrl,
      );
      if (serverRelative) urls.add(serverRelative);
    };

    (restrictToFileUrls || []).forEach((url) => addUrl(url));
    if (isLockedFolderView && normalizedReplaceFileUrl) {
      addUrl(normalizedReplaceFileUrl);
    }
    if (isLockedFolderView) {
      initialSelectedFileUrls.forEach((url) => addUrl(url));
    }

    return [...urls];
  }, [
    restrictToFileUrls,
    isLockedFolderView,
    normalizedReplaceFileUrl,
    initialSelectedUrlsKey,
    absolutePath,
    webAbsoluteUrl,
  ]);
  const restrictToFileUrlsKey = effectiveRestrictUrls.join("\u001f");
  const rawRestrictSourceUrls = React.useMemo(() => {
    const urls = new Set<string>();
    (restrictToFileUrls || []).forEach((url) => {
      const trimmed = String(url || "").trim();
      if (trimmed) urls.add(trimmed);
    });
    if (replaceFileServerRelativeUrl) {
      const trimmed = String(replaceFileServerRelativeUrl).trim();
      if (trimmed) urls.add(trimmed);
    }
    if (isLockedFolderView) {
      initialSelectedFileUrls.forEach((url) => {
        const trimmed = String(url || "").trim();
        if (trimmed) urls.add(trimmed);
      });
    }
    return [...urls];
  }, [
    restrictToFileUrls,
    replaceFileServerRelativeUrl,
    isLockedFolderView,
    initialSelectedUrlsKey,
  ]);
  const rawRestrictSourceUrlsKey = rawRestrictSourceUrls.join("\u001f");
  const visibleFiles = React.useMemo(() => {
    if (!isLockedFolderView) {
      if (effectiveRestrictUrls.length === 0) return files;
      return files.filter((file) =>
        effectiveRestrictUrls.some((allowedUrl) =>
          pathsMatchForRestrict(file.serverRelativeUrl, allowedUrl),
        ),
      );
    }

    return filterFilesToRestrictedDocuments(
      files,
      rawRestrictSourceUrls,
      absolutePath,
      webAbsoluteUrl,
    );
  }, [
    files,
    effectiveRestrictUrls,
    isLockedFolderView,
    rawRestrictSourceUrls,
    absolutePath,
    webAbsoluteUrl,
  ]);

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  const loadSearchTiposPorCarpeta = React.useCallback(
    async (
      idCarpeta: number,
      catalog?: ISearchTipoDocumentoOption[],
    ): Promise<ISearchTipoDocumentoOption[]> => {
      try {
        setLoadingSearchTipos(true);
        const links: any[] = await sp.web.lists
          .getByTitle("TipoDocumento_plantilla")
          .items.filter(`IDCarpeta eq ${idCarpeta}`)
          .select("IDTipoDocumento")
          .top(5000)
          .getAll();

        const idSet = new Set<number>();
        links.forEach((link) => {
          const idTipo = parseSharePointNumber(link.IDTipoDocumento);
          if (idTipo !== null) idSet.add(idTipo);
        });

        const source = catalog ?? searchTiposCatalog;
        const filtrados = source.filter((t) => idSet.has(t.IDTipoDocumento));
        setSearchTiposFiltrados(filtrados);
        return filtrados;
      } catch (err) {
        console.error(
          "Error cargando tipos de documento desde TipoDocumento_plantilla:",
          err,
        );
        setSearchTiposFiltrados([]);
        return [];
      } finally {
        setLoadingSearchTipos(false);
      }
    },
    [searchTiposCatalog],
  );

  const cargarSearchGruposDocumento = React.useCallback(
    async (idTipoExpediente: number): Promise<IGrupoDocumentoOption[]> => {
      try {
        setLoadingSearchGrupos(true);
        const items: any[] = await sp.web.lists
          .getByTitle("CarpetaExpediente")
          .items.filter(`IDTipoExpediente eq ${idTipoExpediente}`)
          .select("IDCarpeta", "Title", "IDPadre")
          .top(5000)
          .getAll();

        const catalog = items
          .map(mapCarpetaExpedienteItem)
          .filter((entry): entry is ICarpetaExpedienteItem => entry !== null);

        const mapped = catalog
          .filter((entry) => !isIdPadreEmpty(entry.idPadre))
          .map(({ idCarpeta, title }) => ({ idCarpeta, title }));

        setSearchGruposDocumento(mapped);
        return mapped;
      } catch (err) {
        console.error(
          "Error cargando grupos de documento desde CarpetaExpediente:",
          err,
        );
        setSearchGruposDocumento([]);
        return [];
      } finally {
        setLoadingSearchGrupos(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    const loadSearchCatalogData = async (): Promise<void> => {
      if (!isDocumentacionSearchEnabled(enableSearchInDocumentacion, libraryName, projectId)) {
        return;
      }

      setSearchGruposDocumento([]);
      setSearchTiposCatalog([]);
      setSearchTiposFiltrados([]);
      setGrupoDocumentoFilter("");
      setTipoDocumentoIdFilter("");
      setSearchError("");

      const projectIdNum = parseSharePointNumber(projectId);
      if (projectIdNum === null) return;

      try {
        const tipos: any[] = await sp.web.lists
          .getByTitle("TiposDocumentacion")
          .items.select("Id", "IDTipoDocumento", "Title", "Acronimo")
          .filter("Activo eq 1")
          .top(5000)
          .getAll();

        const mappedTipos: ISearchTipoDocumentoOption[] = tipos
          .map((t) => ({
            Id: Number(t.Id),
            IDTipoDocumento: Number(t.IDTipoDocumento),
            title: String(t.Title || "").trim(),
            acronimo: String(t.Acronimo || "").trim(),
          }))
          .filter(
            (t) =>
              !isNaN(t.Id) &&
              !isNaN(t.IDTipoDocumento) &&
              !!t.title,
          );

        setSearchTiposCatalog(mappedTipos);
        setSearchTiposFiltrados([]);

        const expItems: any[] = await sp.web.lists
          .getByTitle("Expedientes")
          .items.filter(`IDExpediente eq ${projectIdNum}`)
          .select("IDTipoExpediente")
          .top(1)
          .get();

        const tipoExpedienteRaw =
          expItems[0]?.IDTipoExpediente;
        const idTipoExpediente = parseSharePointNumber(tipoExpedienteRaw);

        if (idTipoExpediente !== null) {
          await cargarSearchGruposDocumento(idTipoExpediente);
        }
      } catch (e) {
        console.error("Error cargando catálogo del buscador de documentos:", e);
        setSearchError("No se pudo cargar el catálogo del buscador.");
      }
    };

    void loadSearchCatalogData();
  }, [
    enableSearchInDocumentacion,
    libraryName,
    projectId,
    context,
    cargarSearchGruposDocumento,
  ]);

  const loadFilteredDestinationDocuments = async (
    folderUrlRaw: string,
    idTipo: number,
  ): Promise<void> => {
    const folderUrl = normalizeServerRelativePath(folderUrlRaw);
    setError("");
    setFolders([]);
    setCurrentFolderUrl(folderUrl);
    setCurrentPath([]);

    try {
      const items: any[] = await sp.web.lists
        .getByTitle("DocumentacionArchivo")
        .items.filter(
          `FileDirRef eq '${escapeODataSingleQuoted(folderUrl)}' and IDTipo eq ${idTipo} and FSObjType eq 0`,
        )
        .select(
          "FileRef",
          "FileLeafRef",
          "Modified",
          "NumeroDocumento",
          "VersionDocumento",
          "TituloDocumento",
          "IDDocumento",
          "FSObjType",
        )
        .top(5000)
        .getAll();

      const mappedFiles: IFileItem[] = items
        .filter(hasIdDocumentoValue)
        .map((item) => mapListItemToFileItem(item))
        .filter((file): file is IFileItem => file !== null);

      setFiles(mappedFiles);
    } catch (e) {
      console.error("Error cargando documentos filtrados por IDTipo:", e);
      setFiles([]);
      setError(
        "No se han podido cargar los documentos de la carpeta de destino para el tipo seleccionado.",
      );
    }
  };

  const loadLatestVersionPerNumeroDocuments = async (
    folderUrlRaw: string,
    idTipo: number,
  ): Promise<void> => {
    const folderUrl = normalizeServerRelativePath(folderUrlRaw);
    setError("");
    setFolders([]);
    setCurrentFolderUrl(folderUrl);
    setCurrentPath([]);

    try {
      const items: any[] = await sp.web.lists
        .getByTitle("DocumentacionArchivo")
        .items.filter(
          `FileDirRef eq '${escapeODataSingleQuoted(folderUrl)}' and IDTipo eq ${idTipo} and FSObjType eq 0`,
        )
        .select(
          "FileRef",
          "FileLeafRef",
          "Modified",
          "NumeroDocumento",
          "VersionDocumento",
          "TituloDocumento",
          "IDDocumento",
          "FSObjType",
        )
        .top(5000)
        .getAll();

      const latestByNumero = new Map<number, any>();
      items.filter(hasIdDocumentoValue).forEach((item) => {
        const numero = Number(item?.NumeroDocumento);
        const version = Number(item?.VersionDocumento);
        if (Number.isNaN(numero)) return;
        const current = latestByNumero.get(numero);
        const currentVersion = Number(current?.VersionDocumento);
        if (
          !current ||
          Number.isNaN(currentVersion) ||
          (!Number.isNaN(version) && version > currentVersion)
        ) {
          latestByNumero.set(numero, item);
        }
      });

      const mappedFiles: IFileItem[] = Array.from(latestByNumero.values())
        .map((item) => mapListItemToFileItem(item))
        .filter((file): file is IFileItem => file !== null)
        .sort((a, b) => (a.numeroDocumento || 0) - (b.numeroDocumento || 0));

      setFiles(mappedFiles);
    } catch (e) {
      console.error(
        "Error cargando últimas versiones por NumeroDocumento:",
        e,
      );
      setFiles([]);
      setError(
        "No se han podido cargar los documentos base para la nueva versión.",
      );
    }
  };

  // Cargar árbol de carpetas raíz para el proyecto (carpeta == projectId dentro de la biblioteca indicada)
  React.useEffect(() => {
    let cancelled = false;

    const loadRoot = async () => {
      setError("");
      setFolders([]);
      setFiles([]);

      if (isDestinationTipoFilterView) {
        if (latestVersionPerNumeroOnly) {
          await loadLatestVersionPerNumeroDocuments(
            String(initialFolderServerRelativeUrl),
            Number(filterByIdTipo),
          );
        } else {
          await loadFilteredDestinationDocuments(
            String(initialFolderServerRelativeUrl),
            Number(filterByIdTipo),
          );
        }
        return;
      }

      if (isLockedFolderView) {
        const folderUrl = toServerRelativeDocumentUrl(
          String(initialFolderServerRelativeUrl),
          absolutePath,
          webAbsoluteUrl,
        );
        const parts = folderUrl.split("/").filter(Boolean);
        const projectIndex = parts.findIndex((p) => p === String(projectId));
        const relativeSegments =
          projectIndex >= 0 ? parts.slice(projectIndex + 1) : [];
        if (cancelled) return;
        setCurrentPath(relativeSegments);
        setCurrentFolderUrl(folderUrl);
        setFolders([]);

        if (rawRestrictSourceUrls.length > 0) {
          const mappedFiles = await loadLockedTaskDocuments(
            folderUrl,
            rawRestrictSourceUrls,
            libraryName,
            absolutePath,
            webAbsoluteUrl,
          );
          if (!cancelled) setFiles(mappedFiles);
        } else if (!cancelled) {
          setFiles([]);
        }
        return;
      }

      if (!projectId) {
        setError("No se ha proporcionado projectId.");
        return;
      }

      try {
        const rootFolderUrl = normalizeServerRelativePath(
          `${absolutePath}/${libraryName}/${projectId}`,
        );
        const rootFolder = sp.web.getFolderByServerRelativePath(rootFolderUrl);

        const subFolders = await rootFolder.folders
          .filter("Name ne 'Forms'")
          .select("Name,ServerRelativeUrl")
          .get();

        const mappedFolders: IFolderNode[] = sortFoldersByLeadingNumber(
          subFolders.map((f) => ({
            name: f.Name as string,
            serverRelativeUrl: f.ServerRelativeUrl as string,
          })),
        );

        if (cancelled) return;
        setFolders(mappedFolders);
        setCurrentPath([]);
        setCurrentFolderUrl(rootFolderUrl);

        const mappedFiles = LIBRARIES_WITH_FILE_METADATA.has(libraryName)
          ? await loadFilesFromLibraryFolder(libraryName, rootFolderUrl)
          : await loadFolderFilesOnly(rootFolderUrl);
        if (!cancelled) setFiles(mappedFiles);
      } catch (e) {
        console.error("Error cargando documentación del proyecto:", e);
        if (!cancelled) {
          setError(
            `No se ha podido cargar la documentación del proyecto. Verifique que exista la carpeta en ${libraryName}.`,
          );
        }
      }
    };

    void loadRoot();
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    absolutePath,
    libraryName,
    initialFolderServerRelativeUrl,
    lockToInitialFolder,
    filterByIdTipo,
    latestVersionPerNumeroOnly,
    selectFilesOnly,
    restrictToFileUrlsKey,
    rawRestrictSourceUrlsKey,
    webAbsoluteUrl,
  ]);

  React.useEffect(() => {
    const selectedInit: Record<string, boolean> = {};
    initialSelectedFileUrls.forEach((url) => {
      if (url) selectedInit[url] = true;
    });
    if (requiredFileUrl) {
      selectedInit[requiredFileUrl] = true;
    }
    setSelectedFiles(selectedInit);
  }, [initialSelectedUrlsKey, requiredFileUrl]);

  const loadFolderContent = async (rawServerRelativeUrl: string) => {
    try {
      const serverRelativeUrl = normalizeServerRelativePath(rawServerRelativeUrl);

      if (isLockedFolderView || effectiveRestrictUrls.length > 0) {
        if (rawRestrictSourceUrls.length > 0) {
          const mappedFiles = await loadLockedTaskDocuments(
            serverRelativeUrl,
            rawRestrictSourceUrls,
            libraryName,
            absolutePath,
            webAbsoluteUrl,
          );
          setFolders([]);
          setFiles(mappedFiles);
          setCurrentFolderUrl(serverRelativeUrl);
          return;
        }
        setFolders([]);
        setFiles([]);
        setCurrentFolderUrl(serverRelativeUrl);
        return;
      }

      const folder = sp.web.getFolderByServerRelativePath(serverRelativeUrl);

      const foldersRes = await folder.folders
        .filter("Name ne 'Forms'")
        .select("Name,ServerRelativeUrl")
        .get();
      const mappedFolders: IFolderNode[] = sortFoldersByLeadingNumber(
        foldersRes.map((f) => ({
          name: f.Name as string,
          serverRelativeUrl: f.ServerRelativeUrl as string,
        })),
      );

      const mappedFiles = LIBRARIES_WITH_FILE_METADATA.has(libraryName)
        ? await loadFilesFromLibraryFolder(libraryName, serverRelativeUrl)
        : await loadFolderFilesOnly(serverRelativeUrl);

      setFolders(mappedFolders);
      setFiles(mappedFiles);
      setCurrentFolderUrl(serverRelativeUrl);
    } catch (e) {
      console.error("Error cargando carpeta:", e);
      setError("No se ha podido cargar el contenido de la carpeta seleccionada.");
    }
  };

  const handleDownloadDocument = async (
    event: React.MouseEvent<HTMLAnchorElement>,
    options: {
      serverRelativeOrAbsoluteUrl: string;
      fileLeafName: string;
      tituloDocumento?: string;
      idDocumento?: number;
    },
  ): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    const rawUrl = String(options.serverRelativeOrAbsoluteUrl || "").trim();
    if (!rawUrl || downloadingFileUrl) return;

    let serverRelativeUrl = rawUrl;
    try {
      if (/^https?:\/\//i.test(rawUrl)) {
        const parsed = new URL(rawUrl);
        serverRelativeUrl = decodeURIComponent(parsed.pathname);
      }
    } catch {
      // keep raw
    }
    serverRelativeUrl = normalizeServerRelativePath(serverRelativeUrl);
    if (!serverRelativeUrl) return;

    try {
      setDownloadingFileUrl(serverRelativeUrl);
      let idDocumento = options.idDocumento;
      let tituloDocumento = options.tituloDocumento;
      let fileLeafName = String(options.fileLeafName || "").trim();

      try {
        const fileItem: any = await sp.web
          .getFileByServerRelativeUrl(serverRelativeUrl)
          .getItem();
        const fields = await fileItem
          .select("TituloDocumento", "IDDocumento", "FileLeafRef")
          .get();
        const tituloFromFile = String(fields?.TituloDocumento || "").trim();
        const idRaw = Number(fields?.IDDocumento);
        const leafFromFile = String(fields?.FileLeafRef || "").trim();
        if (tituloFromFile) tituloDocumento = tituloFromFile;
        if (Number.isFinite(idRaw) && idRaw > 0) idDocumento = idRaw;
        if (leafFromFile) fileLeafName = leafFromFile;
      } catch {
        // Usar metadatos ya conocidos en el listado.
      }

      if (!fileLeafName) {
        fileLeafName = serverRelativeUrl.split("/").pop() || "documento";
      }

      const downloadName = buildDocumentDownloadFileName(
        fileLeafName,
        idDocumento,
        tituloDocumento,
        { includeNomenclaturePrefix },
      );

      const buffer = await sp.web
        .getFileByServerRelativeUrl(serverRelativeUrl)
        .getBuffer();
      const blob = new Blob([buffer], {
        type: "application/octet-stream",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
      }, 0);
    } catch (e) {
      console.error("Error descargando documento:", e);
      setError("No se ha podido descargar el documento seleccionado.");
    } finally {
      setDownloadingFileUrl("");
    }
  };

  const handleFolderClick = (folder: IFolderNode) => {
    const parts = folder.serverRelativeUrl.split("/");
    const projectIndex = parts.findIndex((p) => p === String(projectId));
    const relativeSegments =
      projectIndex >= 0 ? parts.slice(projectIndex + 1) : parts.slice(-1);
    setCurrentPath(relativeSegments);
    void loadFolderContent(
      normalizeServerRelativePath(folder.serverRelativeUrl),
    );
  };

  const handleBreadcrumbClick = (breadcrumbIndex: number) => {
    if (!projectId) return;

    // segments: [libraryName, projectId, ...currentPath]
    // breadcrumbIndex 0 o 1 => raíz del proyecto
    // breadcrumbIndex >= 2 => subcarpeta dentro del proyecto
    let newSegments: string[] = [];
    if (breadcrumbIndex >= 2) {
      newSegments = currentPath.slice(0, breadcrumbIndex - 1);
    }

    const folderUrl = normalizeServerRelativePath(
      newSegments.length === 0
        ? `${absolutePath}/${libraryName}/${projectId}`
        : `${absolutePath}/${libraryName}/${projectId}/${newSegments.join(
            "/",
          )}`,
    );

    setCurrentPath(newSegments);
    void loadFolderContent(folderUrl);
  };
  const handleGoBackFolder = (): void => {
    if (!projectId || currentPath.length === 0) return;

    const newSegments = currentPath.slice(0, -1);
    const folderUrl = normalizeServerRelativePath(
      newSegments.length === 0
        ? `${absolutePath}/${libraryName}/${projectId}`
        : `${absolutePath}/${libraryName}/${projectId}/${newSegments.join(
            "/",
          )}`,
    );

    setCurrentPath(newSegments);
    void loadFolderContent(folderUrl);
  };

  const toggleFileSelection = (file: IFileItem) => {
    if (!selectable) return;

    const buildSelectedMetadata = (
      selectedUrls: string[],
    ): {
      numeroDocumento: number | null;
      versionDocumento: number | null;
    } | null => {
      const primary =
        selectedUrls.find((url) => url !== requiredFileUrl) || selectedUrls[0];
      if (!primary) return null;
      const selectedFile = files.find((f) => f.serverRelativeUrl === primary);
      if (!selectedFile) return null;
      return {
        numeroDocumento: selectedFile.numeroDocumento ?? null,
        versionDocumento: selectedFile.versionDocumento ?? null,
      };
    };

    setSelectedFiles((prev) => {
      if (requiredFileUrl && file.serverRelativeUrl === requiredFileUrl) {
        const selectedFileUrlsLocked = Object.keys(prev).filter(
          (k) => prev[k] === true,
        );
        if (onSelectionChange) {
          onSelectionChange({
            fileUrl: currentFolderUrl ? file.serverRelativeUrl : null,
            folderUrl: currentFolderUrl,
            selectedFileUrls: selectedFileUrlsLocked,
            selectedFileMetadata: buildSelectedMetadata(selectedFileUrlsLocked),
          });
        }
        return prev;
      }

      const alreadySelected = !!prev[file.serverRelativeUrl];
      const next: Record<string, boolean> = { ...prev };
      if (alreadySelected) {
        delete next[file.serverRelativeUrl];
      } else {
        if (singleSelection) {
          const singleNext: Record<string, boolean> = {};
          if (requiredFileUrl) {
            singleNext[requiredFileUrl] = true;
          }
          singleNext[file.serverRelativeUrl] = true;
          Object.keys(next).forEach((k) => delete next[k]);
          Object.assign(next, singleNext);
        } else {
          next[file.serverRelativeUrl] = true;
        }
      }

      const selectedFileUrls = Object.keys(next).filter(
        (k) => next[k] === true,
      );

      if (onSelectionChange) {
        onSelectionChange({
          fileUrl: currentFolderUrl ? file.serverRelativeUrl : null,
          folderUrl: currentFolderUrl,
          selectedFileUrls,
          selectedFileMetadata: buildSelectedMetadata(selectedFileUrls),
        });
      }

      return next;
    });
  };

  const handleUploadFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const inputEl = e.currentTarget;
    const fileList = inputEl.files;
    if (!fileList || fileList.length === 0) return;
    if (!currentFolderUrl) {
      setError("No se ha podido determinar la carpeta actual para subir archivos.");
      inputEl.value = "";
      return;
    }

    if (normalizedReplaceFileUrl) {
      const uploadFile = fileList.item(0);
      if (!uploadFile) {
        inputEl.value = "";
        return;
      }

      const replaceFolderUrl = normalizeServerRelativePath(
        normalizedReplaceFileUrl.replace(/\/[^/]+$/, ""),
      );
      const folderPath = normalizeServerRelativePath(currentFolderUrl);
      if (folderPath !== replaceFolderUrl) {
        setError(
          "Solo puede subir el documento firmado en la misma ubicación del archivo de la tarea.",
        );
        inputEl.value = "";
        return;
      }

      const targetFileName = uploadFile.name.trim();
      if (!targetFileName) {
        setError("El archivo seleccionado no tiene un nombre válido.");
        inputEl.value = "";
        return;
      }
      const newFileUrl = normalizeServerRelativePath(
        `${folderPath}/${targetFileName}`,
      );

      try {
        setIsUploading(true);
        setError("");
        const preservedMetadata = await readFileListItemMetadata(
          normalizedReplaceFileUrl,
        );
        const webAbsoluteUrl = context.pageContext.web.absoluteUrl.replace(
          /\/$/,
          "",
        );
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

        if (rawRestrictSourceUrls.length > 0) {
          const mappedFiles = await loadLockedTaskDocuments(
            folderPath,
            [...rawRestrictSourceUrls, newFileUrl],
            libraryName,
            absolutePath,
            webAbsoluteUrl,
          );
          setFolders([]);
          setFiles(mappedFiles);
        } else {
          await loadFolderContent(folderPath);
        }

        const nextSelected: Record<string, boolean> = {
          [newFileUrl]: true,
        };
        setSelectedFiles(nextSelected);

        if (onSelectionChange) {
          onSelectionChange({
            fileUrl: newFileUrl,
            folderUrl: folderPath,
            selectedFileUrls: [newFileUrl],
            selectedFileMetadata: null,
          });
        }

        if (onUploadComplete) {
          onUploadComplete({ fileUrl: newFileUrl });
        }
      } catch (uploadErr) {
        console.error("Error reemplazando documento firmado:", uploadErr);
        setError(
          "No se ha podido reemplazar el documento de la tarea con el archivo firmado.",
        );
      } finally {
        setIsUploading(false);
        inputEl.value = "";
      }
      return;
    }

    try {
      setIsUploading(true);
      setError("");
      const folderPath = normalizeServerRelativePath(currentFolderUrl);
      const webAbsoluteUrl = context.pageContext.web.absoluteUrl.replace(
        /\/$/,
        "",
      );

      // PnP getFolderByServerRelativePath + files.add puede devolver 403 en subcarpetas
      // con acentos o rutas largas; GetFolderByServerRelativeUrl + SPHttpClient alinea
      // el comportamiento con el explorador de SharePoint.
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList.item(i);
        if (!f) continue;
        const endpoint = `${webAbsoluteUrl}/_api/web/GetFolderByServerRelativeUrl('${escapeODataSingleQuoted(
          folderPath,
        )}')/Files/Add(overwrite=true,url='${escapeODataSingleQuoted(f.name)}')`;

        const response = await context.spHttpClient.post(
          endpoint,
          SPHttpClient.configurations.v1,
          {
            body: await f.arrayBuffer(),
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

        // Subida limpia: sin metadatos promovidos del fichero ni restos de overwrite.
        if (LIBRARIES_WITH_FILE_METADATA.has(libraryName)) {
          const uploadedUrl = normalizeServerRelativePath(
            `${folderPath}/${f.name}`,
          );
          await clearFileListItemMetadata(uploadedUrl);
        }
      }
      await loadFolderContent(folderPath);
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (uploadErr) {
      console.error("Error subiendo archivos:", uploadErr);
      setError("No se han podido subir los documentos seleccionados.");
    } finally {
      setIsUploading(false);
      inputEl.value = "";
    }
  };

  const formatDateTime = (value?: string) => {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-ES");
  };

  const onSearchFilterChange = (
    field: keyof IDocumentSearchFilters,
    value: string,
  ): void => {
    setSearchFilters((prev) => ({ ...prev, [field]: value }));
  };

  const runDocumentSearch = async (): Promise<void> => {
    if (!isDocumentacionSearchEnabled(enableSearchInDocumentacion, libraryName, projectId)) {
      return;
    }
    if (grupoDocumentoFilter && !tipoDocumentoIdFilter) {
      setSearchError(
        "La búsqueda solo por grupo de documentos no está soportada. Debe seleccionar un tipo de documentación.",
      );
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError("");
    try {
      const siteUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
      const kqlParts: string[] = [
        `Path:"${siteUrl}/${libraryName}/${projectId}/*"`,
        "contentclass:STS_ListItem_DocumentLibrary",
        "IsDocument:1",
      ];

      const appendContains = (managedProp: string, value: string): void => {
        const clean = String(value || "").trim();
        if (!clean) return;
        kqlParts.push(`${managedProp}:"${escapeKqlValue(clean)}"`);
      };
      const appendFileNameContains = (value: string): void => {
        const clean = String(value || "").trim();
        if (!clean) return;
        kqlParts.push(`Filename:"*${escapeKqlValue(clean)}*"`);
      };
      const appendExactNumber = (managedProp: string, value: string): void => {
        const clean = String(value || "").trim();
        if (!clean) return;
        if (!/^\d+$/.test(clean)) return;
        kqlParts.push(`${managedProp}:${clean}`);
      };

      appendExactNumber(
        SEARCH_PROPS.idExpedienteDocumento,
        searchFilters.idExpedienteDocumento,
      );
      appendContains(SEARCH_PROPS.tituloDocumento, searchFilters.tituloDocumento);
      appendContains(SEARCH_PROPS.nombreDocumento, searchFilters.nombreDocumento);
      appendFileNameContains(searchFilters.nombreArchivo);
      appendContains(
        SEARCH_PROPS.tipologiaDocumental,
        searchFilters.tipologiaDocumental,
      );
      if (libraryName === "DocumentacionArchivo") {
        appendContains(SEARCH_PROPS.numeroDocumento, searchFilters.numeroDocumento);
        appendContains(SEARCH_PROPS.versionDocumento, searchFilters.versionDocumento);
      }

      if (tipoDocumentoIdFilter) {
        kqlParts.push(
          `${SEARCH_PROPS.tipologiaDocumental}:"${escapeKqlValue(
            tipoDocumentoIdFilter,
          )}"`,
        );
      }

      const response = await sp.search({
        Querytext: kqlParts.join(" AND "),
        RowLimit: 300,
        TrimDuplicates: false,
        SelectProperties: [
          "Title",
          "Path",
          "FileName",
          SEARCH_PROPS.idExpedienteDocumento,
          SEARCH_PROPS.tituloDocumento,
          SEARCH_PROPS.nombreDocumento,
          SEARCH_PROPS.tipologiaDocumental,
          SEARCH_PROPS.numeroDocumento,
          SEARCH_PROPS.versionDocumento,
        ],
      });

      const items: any[] = response?.PrimarySearchResults || [];
      const mapped: IDocumentSearchResult[] = items.map((it, index) => ({
        id: Number(it.DocId || index + 1),
        idExpedienteDocumento: String(it[SEARCH_PROPS.idExpedienteDocumento] || ""),
        tituloDocumento: String(it[SEARCH_PROPS.tituloDocumento] || ""),
        nombreDocumento: String(it[SEARCH_PROPS.nombreDocumento] || ""),
        tipologiaDocumental: String(it[SEARCH_PROPS.tipologiaDocumental] || ""),
        numeroDocumento: String(it[SEARCH_PROPS.numeroDocumento] || ""),
        versionDocumento: String(it[SEARCH_PROPS.versionDocumento] || ""),
        fileName: String(it.FileName || it.Title || ""),
        path: String(it.Path || ""),
      }));
      setSearchResults(mapped);
      if (
        mapped.length === 0 &&
        (searchFilters.idExpedienteDocumento ||
          searchFilters.tituloDocumento ||
          searchFilters.nombreDocumento ||
          searchFilters.nombreArchivo ||
          searchFilters.tipologiaDocumental ||
          searchFilters.numeroDocumento ||
          searchFilters.versionDocumento ||
          tipoDocumentoIdFilter)
      ) {
        setSearchError(
          "No hay resultados. Verifica que las propiedades administradas estén mapeadas e indexadas.",
        );
      }
    } catch (searchError) {
      console.error("Error en búsqueda de documentos:", searchError);
      setSearchResults([]);
      setSearchError("No se pudo ejecutar la búsqueda de documentos.");
    } finally {
      setIsSearching(false);
    }
  };

  const clearDocumentSearch = (): void => {
    setSearchFilters({
      idExpedienteDocumento: "",
      tituloDocumento: "",
      nombreDocumento: "",
      nombreArchivo: "",
      tipologiaDocumental: "",
      numeroDocumento: "",
      versionDocumento: "",
    });
    setGrupoDocumentoFilter("");
    setTipoDocumentoIdFilter("");
    setSearchTiposFiltrados([]);
    setSearchResults([]);
    setSearchError("");
  };

  const searchTiposDocumentoOptions = searchTiposFiltrados;

  const tipoNombreById = React.useMemo(() => {
    const map: Record<string, string> = {};
    searchTiposCatalog.forEach((t) => {
      map[String(t.IDTipoDocumento)] = t.acronimo
        ? `${t.title} (${t.acronimo})`
        : t.title;
    });
    return map;
  }, [searchTiposCatalog]);

  const renderBreadcrumb = () => {
    if (!projectId) return null;

    const segments = [projectId, ...currentPath];

    return (
      <div className={styles.breadcrumb}>
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={`${seg}-${idx}`}>
              <span
                className={`${styles.breadcrumbSegment} ${
                  idx === segments.length - 1 ? "" : ""
                }`}
                onClick={() => handleBreadcrumbClick(idx)}
              >
                {seg}
              </span>
              {!isLast && (
                <span className={styles.breadcrumbSeparator}>/</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const isDestinationDocsReadOnlyView =
    isDestinationTipoFilterView && !latestVersionPerNumeroOnly;
  const showDocumentNumberColumns =
    !hideDocumentNumberColumns &&
    (isDestinationDocsReadOnlyView ||
      latestVersionPerNumeroOnly ||
      isLockedFolderView ||
      files.some((file) => file.numeroDocumento !== undefined) ||
      files.some((file) => file.versionDocumento !== undefined));
  const showLastModifiedColumn =
    !isDestinationTipoFilterView && !isLockedFolderView;
  const showDeleteFileAction =
    libraryName === "DocumentacionTrabajo" &&
    !isDestinationTipoFilterView &&
    !isLockedFolderView &&
    allowUpload;
  const showSearchDocumentNumberColumns = libraryName === "DocumentacionArchivo";
  const includeNomenclaturePrefix = libraryName === "DocumentacionArchivo";
  const resolveFileNumeroDocumento = (file: IFileItem): number | undefined => {
    if (file.numeroDocumento !== undefined && file.numeroDocumento !== null) {
      return file.numeroDocumento;
    }
    if (
      isLockedFolderView &&
      fileMetadataFallback?.numeroDocumento !== undefined &&
      fileMetadataFallback?.numeroDocumento !== null
    ) {
      return fileMetadataFallback.numeroDocumento;
    }
    return undefined;
  };

  const resolveFileVersionDocumento = (file: IFileItem): number | undefined => {
    if (file.versionDocumento !== undefined && file.versionDocumento !== null) {
      return file.versionDocumento;
    }
    if (
      isLockedFolderView &&
      fileMetadataFallback?.versionDocumento !== undefined &&
      fileMetadataFallback?.versionDocumento !== null
    ) {
      return fileMetadataFallback.versionDocumento;
    }
    return undefined;
  };

  const handleRequestDeleteFile = (
    file: IFileItem,
    event: React.MouseEvent,
  ): void => {
    event.stopPropagation();
    if (
      requiredFileUrl &&
      normalizeServerRelativePath(file.serverRelativeUrl) ===
        normalizeServerRelativePath(requiredFileUrl)
    ) {
      setError("No se puede eliminar el documento obligatorio de la tarea.");
      return;
    }
    setError("");
    setFilePendingDelete(file);
  };

  const handleCancelDeleteFile = (): void => {
    if (isDeletingFile) return;
    setFilePendingDelete(null);
  };

  const handleConfirmDeleteFile = async (): Promise<void> => {
    if (!filePendingDelete) return;

    setIsDeletingFile(true);
    setError("");
    try {
      const fileUrl = normalizeServerRelativePath(
        filePendingDelete.serverRelativeUrl,
      );
      await sp.web.getFileByServerRelativeUrl(fileUrl).recycle();

      setSelectedFiles((prev) => {
        const next = { ...prev };
        delete next[filePendingDelete.serverRelativeUrl];
        if (requiredFileUrl) {
          next[requiredFileUrl] = true;
        }

        if (onSelectionChange) {
          const selectedFileUrls = Object.keys(next).filter(
            (url) => next[url] === true,
          );
          onSelectionChange({
            fileUrl: null,
            folderUrl: currentFolderUrl,
            selectedFileUrls,
            selectedFileMetadata: null,
          });
        }

        return next;
      });

      if (currentFolderUrl) {
        await loadFolderContent(currentFolderUrl);
      }

      if (onUploadComplete) {
        onUploadComplete();
      }

      setFilePendingDelete(null);
    } catch (deleteErr) {
      console.error("Error eliminando documento:", deleteErr);
      setError("No se ha podido eliminar el documento seleccionado.");
    } finally {
      setIsDeletingFile(false);
    }
  };
  return (
    <div
      className={`${styles.container} ${
        isSinglePanelView || hideFolderPanel ? styles.containerSinglePanel : ""
      }`}
    >
      {!isSinglePanelView && !hideFolderPanel && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Carpetas</h3>
          </div>
          <div className={styles.folderTree}>
            {folders.length === 0 && (
              <div className={styles.emptyState}>
                No se han encontrado carpetas para este proyecto.
              </div>
            )}
            {folders.map((folder) => (
              <div
                key={folder.serverRelativeUrl}
                className={styles.folderNode}
                onClick={() => handleFolderClick(folder)}
              >
                <span>📁</span>
                <span className={styles.folderName}>{folder.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.filesHeaderInfo}>
            <h3 className={styles.panelTitle}>
              {latestVersionPerNumeroOnly
                ? "Documentos base (última versión por número)"
                : isDestinationTipoFilterView
                  ? "Documentos en carpeta de destino"
                  : isLockedFolderView
                    ? "Documento de la tarea"
                    : hideFolderPanel
                      ? "Documentos"
                      : selectFilesOnly
                        ? "Documentos"
                        : "Archivos"}
            </h3>
            {((!isSinglePanelView && !hideFolderPanel) || selectFilesOnly) &&
              renderBreadcrumb()}
          </div>
          <div className={styles.filesHeaderActions}>
            {((!isSinglePanelView && !hideFolderPanel) || selectFilesOnly) && (
              <button
                type="button"
                className={styles.backButton}
                onClick={handleGoBackFolder}
                disabled={currentPath.length === 0}
                title="Volver a la carpeta anterior"
                aria-label="Volver a la carpeta anterior"
              >
                Volver
              </button>
            )}
            {allowUpload && (
              <label className={styles.uploadButton}>
                {isUploading
                  ? "Subiendo..."
                  : normalizedReplaceFileUrl
                    ? "Subir documento firmado"
                    : "Agregar"}
                <input
                  type="file"
                  multiple={!normalizedReplaceFileUrl}
                  onChange={(e) => void handleUploadFiles(e)}
                  disabled={isUploading}
                />
              </label>
            )}
          </div>
        </div>

        {visibleFiles.length === 0 ? (
          <div className={styles.emptyState}>
            {latestVersionPerNumeroOnly
              ? "No hay documentos con número documental en la carpeta de destino."
              : isDestinationTipoFilterView
                ? "No hay documentos del tipo seleccionado en la carpeta de destino."
                : isLockedFolderView
                  ? "No hay documento de la tarea en esta ubicación."
                  : selectFilesOnly
                    ? "No hay documentos en la carpeta seleccionada."
                    : "No hay archivos en la carpeta seleccionada."}
          </div>
        ) : (
          <table className={styles.filesTable}>
            <thead>
              <tr>
                {selectable && <th />}
                <th>Nombre</th>
                {showSearchDocumentNumberColumns && <th>N.º documento</th>}
                {showSearchDocumentNumberColumns && <th>Versión</th>}
                {showLastModifiedColumn && <th>Última modificación</th>}
                {showDeleteFileAction && <th className={styles.actionsColumn} />}
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map((file) => (
                <tr
                  key={file.serverRelativeUrl}
                  className={styles.fileRow}
                  onClick={() => selectable && toggleFileSelection(file)}
                >
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={!!selectedFiles[file.serverRelativeUrl]}
                        disabled={
                          !!requiredFileUrl &&
                          file.serverRelativeUrl === requiredFileUrl
                        }
                        onChange={() => toggleFileSelection(file)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
                  <td>
                    <div className={styles.fileNameCell}>
                      <span>📄</span>
                      <a
                        href="#"
                        onClick={(e) =>
                          void handleDownloadDocument(e, {
                            serverRelativeOrAbsoluteUrl: file.serverRelativeUrl,
                            fileLeafName: file.name,
                            tituloDocumento: file.tituloDocumento,
                            idDocumento: file.idDocumento,
                          })
                        }
                      >
                        {downloadingFileUrl ===
                        normalizeServerRelativePath(file.serverRelativeUrl)
                          ? "Descargando..."
                          : buildDocumentDisplayName(
                              file.tituloDocumento,
                              file.name,
                              { includeNomenclaturePrefix },
                            )}
                      </a>
                    </div>
                  </td>
                  {showSearchDocumentNumberColumns && (
                    <td>{resolveFileNumeroDocumento(file) ?? "—"}</td>
                  )}
                  {showSearchDocumentNumberColumns && (
                    <td>{resolveFileVersionDocumento(file) ?? "—"}</td>
                  )}
                  {showLastModifiedColumn && (
                    <td>{formatDateTime(file.timeLastModified)}</td>
                  )}
                  {showDeleteFileAction && (
                    <td className={styles.actionsColumn}>
                      <button
                        type="button"
                        className={styles.deleteFileButton}
                        title="Eliminar documento"
                        aria-label={`Eliminar documento ${buildDocumentDisplayName(
                          file.tituloDocumento,
                          file.name,
                          { includeNomenclaturePrefix },
                        )}`}
                        disabled={
                          isDeletingFile ||
                          (!!requiredFileUrl &&
                            normalizeServerRelativePath(
                              file.serverRelativeUrl,
                            ) ===
                              normalizeServerRelativePath(requiredFileUrl))
                        }
                        onClick={(event) => handleRequestDeleteFile(file, event)}
                      >
                        <svg
                          className={styles.deleteFileIcon}
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M4 6.75H16"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M8 4.5H12L12.75 6.75H7.25L8 4.5Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6.25 6.75L7 15.25C7.05 15.94 7.62 16.5 8.31 16.5H11.69C12.38 16.5 12.95 15.94 13 15.25L13.75 6.75"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M8.5 9.25V13.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M11.5 9.25V13.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && <div className={styles.errorMessage}>{error}</div>}
      </div>

      {isDocumentacionSearchEnabled(
        enableSearchInDocumentacion,
        libraryName,
        projectId,
      ) && (
          <div className={`${styles.panel} ${styles.searchPanel}`}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Buscador de archivos</h3>
            </div>
            <div className={styles.searchBox}>
              <div className={styles.searchGrid}>
                <div className={styles.searchField}>
                  <label>Grupo de documentos</label>
                  <select
                    value={grupoDocumentoFilter}
                    onChange={(e) => {
                      void (async () => {
                        const value = e.target.value;
                        setGrupoDocumentoFilter(value);
                        setTipoDocumentoIdFilter("");
                        setSearchTiposFiltrados([]);
                        setSearchError("");
                        const idCarpeta = value ? Number(value) : NaN;
                        if (!isNaN(idCarpeta)) {
                          await loadSearchTiposPorCarpeta(idCarpeta);
                        }
                      })();
                    }}
                    disabled={
                      loadingSearchGrupos || searchGruposDocumento.length === 0
                    }
                  >
                    <option value="">
                      {loadingSearchGrupos
                        ? "Cargando grupos..."
                        : searchGruposDocumento.length
                          ? "Todos"
                          : "Sin grupos disponibles"}
                    </option>
                    {searchGruposDocumento.map((grupo) => (
                      <option key={grupo.idCarpeta} value={String(grupo.idCarpeta)}>
                        {grupo.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.searchField}>
                  <label>Tipo documentación</label>
                  <select
                    value={tipoDocumentoIdFilter}
                    onChange={(e) => {
                      setTipoDocumentoIdFilter(e.target.value);
                      setSearchError("");
                    }}
                    disabled={
                      !grupoDocumentoFilter ||
                      loadingSearchTipos ||
                      searchTiposDocumentoOptions.length === 0
                    }
                  >
                    <option value="">
                      {!grupoDocumentoFilter
                        ? "Seleccione un grupo"
                        : loadingSearchTipos
                          ? "Cargando tipos..."
                          : searchTiposDocumentoOptions.length
                            ? "Todos"
                            : "Sin tipos disponibles"}
                    </option>
                    {searchTiposDocumentoOptions.map((tipo) => (
                      <option
                        key={tipo.Id}
                        value={String(tipo.IDTipoDocumento)}
                      >
                        {tipo.acronimo
                          ? `${tipo.title} (${tipo.acronimo})`
                          : tipo.title}
                      </option>
                    ))}
                  </select>
                </div>
                {/* <div className={styles.searchField}>
                  <label>ID Expediente</label>
                  <input
                    value={searchFilters.idExpedienteDocumento}
                    onChange={(e) =>
                      onSearchFilterChange("idExpedienteDocumento", e.target.value)
                    }
                  />
                </div> */}
                <div className={styles.searchField}>
                  <label>Título</label>
                  <input
                    value={searchFilters.tituloDocumento}
                    onChange={(e) =>
                      onSearchFilterChange("tituloDocumento", e.target.value)
                    }
                  />
                </div>
                <div className={styles.searchField}>
                  <label>Nombre</label>
                  <input
                    value={searchFilters.nombreDocumento}
                    onChange={(e) =>
                      onSearchFilterChange("nombreDocumento", e.target.value)
                    }
                  />
                </div>
                <div className={styles.searchField}>
                  <label>Archivo</label>
                  <input
                    value={searchFilters.nombreArchivo}
                    onChange={(e) =>
                      onSearchFilterChange("nombreArchivo", e.target.value)
                    }
                    placeholder="Nombre del fichero"
                  />
                </div>
                {showSearchDocumentNumberColumns && (
                  <div className={styles.searchField}>
                    <label>Número documento</label>
                    <input
                      value={searchFilters.numeroDocumento}
                      onChange={(e) =>
                        onSearchFilterChange("numeroDocumento", e.target.value)
                      }
                    />
                  </div>
                )}
                {showSearchDocumentNumberColumns && (
                  <div className={styles.searchField}>
                    <label>Versión</label>
                    <input
                      value={searchFilters.versionDocumento}
                      onChange={(e) =>
                        onSearchFilterChange("versionDocumento", e.target.value)
                      }
                    />
                  </div>
                )}
              </div>
              {searchError && (
                <div className={styles.searchErrorMessage}>{searchError}</div>
              )}
              <div className={styles.searchActions}>
                <button
                  type="button"
                  className={styles.searchButton}
                  onClick={() => void runDocumentSearch()}
                  disabled={isSearching}
                >
                  {isSearching ? "Buscando..." : "Buscar en expediente"}
                </button>
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={clearDocumentSearch}
                  disabled={isSearching}
                >
                  Limpiar
                </button>
              </div>

              {searchResults.length > 0 && (
                <table className={styles.searchResultsTable}>
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Tipo documentación</th>
                      {showSearchDocumentNumberColumns && <th>Número</th>}
                      {showSearchDocumentNumberColumns && <th>Versión</th>}
                      <th>Archivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((row) => (
                      <tr key={row.id}>
                        <td>{row.tituloDocumento}</td>
                        <td>
                          {tipoNombreById[String(row.tipologiaDocumental)] ||
                            row.tipologiaDocumental}
                        </td>
                        {showSearchDocumentNumberColumns && (
                          <td>{row.numeroDocumento}</td>
                        )}
                        {showSearchDocumentNumberColumns && (
                          <td>{row.versionDocumento}</td>
                        )}
                        <td>
                          <a
                            href="#"
                            onClick={(e) =>
                              void handleDownloadDocument(e, {
                                serverRelativeOrAbsoluteUrl: row.path,
                                fileLeafName: row.fileName,
                                tituloDocumento: row.tituloDocumento,
                                idDocumento: row.idDocumento,
                              })
                            }
                          >
                            {(() => {
                              let pathKey = row.path;
                              try {
                                if (/^https?:\/\//i.test(row.path)) {
                                  pathKey = decodeURIComponent(
                                    new URL(row.path).pathname,
                                  );
                                }
                              } catch {
                                // keep
                              }
                              pathKey = normalizeServerRelativePath(pathKey);
                              return downloadingFileUrl === pathKey
                                ? "Descargando..."
                                : buildDocumentDisplayName(
                                    row.tituloDocumento,
                                    row.fileName,
                                    { includeNomenclaturePrefix },
                                  );
                            })()}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      {filePendingDelete && (
        <div
          className={styles.confirmOverlay}
          onClick={handleCancelDeleteFile}
          role="presentation"
        >
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-file-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4
              id="delete-file-dialog-title"
              className={styles.confirmDialogTitle}
            >
              Confirmar eliminación
            </h4>
            <p className={styles.confirmDialogMessage}>
              ¿Desea eliminar el documento{" "}
              <strong>
                {buildDocumentDisplayName(
                  filePendingDelete.tituloDocumento,
                  filePendingDelete.name,
                  { includeNomenclaturePrefix },
                )}
              </strong>
              ? Se enviará a la papelera de reciclaje de SharePoint.
            </p>
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                onClick={handleCancelDeleteFile}
                disabled={isDeletingFile}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => void handleConfirmDeleteFile()}
                disabled={isDeletingFile}
              >
                {isDeletingFile ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDocumentation;