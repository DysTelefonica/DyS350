// @ts-nocheck
import * as React from "react";
import { sp } from "@pnp/sp";
import styles from "./AdvancedSearch.module.scss";
import type { IAdvancedSearchProps } from "./IAdvancedSearchProps";
import Pagination from "../../../ui/pagination/Pagination";

interface IAdvancedSearchFilters {
  tituloDocumento: string;
  nombreArchivo: string;
  tipologiaDocumental: string;
  numeroDocumento: string;
  versionDocumento: string;
  nemotecnico: string;
  codExp: string;
}

interface IAdvancedSearchResult {
  id: number;
  idExpedienteDocumento: string;
  tituloDocumento: string;
  nombreDocumento: string;
  tipologiaDocumental: string;
  numeroDocumento: string;
  versionDocumento: string;
  ordinalE2E: string;
  nemotecnico: string;
  codExp: string;
  fileLeafRef: string;
  fileRef: string;
}

interface ITipoDocumentoOption {
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

const DEFAULT_ID_TIPO_EXPEDIENTE = 1;

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

// Estas propiedades administradas deben mapearse en Search Service Application.
// Ajusta los nombres si en tu tenant usas otros RefinableString.
const SEARCH_PROPS = {
  idExpedienteDocumento: "RefinableInt01",
  tituloDocumento: "RefinableString10",
  nombreDocumento: "RefinableString11",
  tipologiaDocumental: "RefinableString102",
  numeroDocumento: "RefinableString13",
  versionDocumento: "RefinableString100",
  ordinalE2E: "RefinableString101",
  /** Columna DocumentacionArchivo.Nemotecnico → mapear a esta propiedad. */
  nemotecnico: "RefinableString103",
  /** Columna DocumentacionArchivo.CodExp → mapear a esta propiedad. */
  codExp: "RefinableString104",
};

const escapeKqlValue = (value: string): string =>
  String(value || "")
    .trim()
    .replace(/"/g, '""');

/** Lote de Search API; SharePoint suele limitar ~500 por petición. */
const SEARCH_FETCH_PAGE_SIZE = 500;
/** Tope de filas brutas a traer antes de deduplicar (paginación en cliente). */
const SEARCH_MAX_RAW_ROWS = 2000;

/**
 * Excluye filas sin clave completa de agrupación / versión.
 * TipologiaDocumental en el índice actúa como IDTipo.
 */
const hasCompleteVersionGroupKeys = (row: {
  idExpedienteDocumento: string;
  tipologiaDocumental: string;
  numeroDocumento: string;
  versionDocumento: string;
}): boolean => {
  const idExp = Number(row.idExpedienteDocumento);
  const idTipo = Number(row.tipologiaDocumental);
  const numero = Number(row.numeroDocumento);
  const version = Number(row.versionDocumento);
  return (
    Number.isFinite(idExp) &&
    idExp > 0 &&
    Number.isFinite(idTipo) &&
    idTipo > 0 &&
    Number.isFinite(numero) &&
    numero > 0 &&
    Number.isFinite(version) &&
    version > 0
  );
};

const buildVersionGroupKey = (row: {
  idExpedienteDocumento: string;
  tipologiaDocumental: string;
  numeroDocumento: string;
}): string =>
  `${Number(row.idExpedienteDocumento)}|${Number(row.tipologiaDocumental)}|${Number(row.numeroDocumento)}`;

/**
 * Por (IDExpedienteDocumento, IDTipo, NumeroDocumento) conserva solo la VersionDocumento
 * máxima; si hay empate, mantiene todos los empatados.
 */
const keepHighestVersionPerGroup = <
  T extends {
    idExpedienteDocumento: string;
    tipologiaDocumental: string;
    numeroDocumento: string;
    versionDocumento: string;
  },
>(
  rows: T[],
): T[] => {
  const maxByKey = new Map<string, number>();
  rows.forEach((row) => {
    const key = buildVersionGroupKey(row);
    const version = Number(row.versionDocumento);
    const current = maxByKey.get(key);
    if (current === undefined || version > current) {
      maxByKey.set(key, version);
    }
  });
  return rows.filter(
    (row) => Number(row.versionDocumento) === maxByKey.get(buildVersionGroupKey(row)),
  );
};

const getFileExtensionWithDot = (fileName: string): string => {
  const leaf = String(fileName || "").trim();
  const dot = leaf.lastIndexOf(".");
  if (dot <= 0) return "";
  return leaf.substring(dot);
};

/**
 * Prefijo de cierre de versión: TT-XXXXXX-AA-vBB(-)
 * El guion tras la versión es opcional (misma regla que ProjectDocumentation).
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
 * Antepone el patrón de nomenclatura del FileLeafRef (DocumentacionArchivo).
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

  const bodyFromLeaf = leaf.replace(NOMENCLATURE_PREFIX_PATTERN, "").trim();
  const displayBody = titulo
    ? `${titulo}${ext}`
    : bodyFromLeaf || leaf || "Abrir";
  if (displayBody.toLowerCase().startsWith(prefix.toLowerCase())) {
    return displayBody;
  }
  return `${prefix}${displayBody}`;
};

const stripIdDocumentoFromFileName = (
  fileName: string,
  idDocumento?: number | null,
): string => {
  const leaf = String(fileName || "").trim();
  if (!leaf || idDocumento === null || idDocumento === undefined) return leaf;
  const idNum = Number(idDocumento);
  if (!Number.isFinite(idNum) || idNum <= 0) return leaf;
  if (!leaf.toLowerCase().endsWith(".pdf")) return leaf;
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
    const fromLeaf = stripIdDocumentoFromFileName(leaf, idDocumento);
    if (fromLeaf !== leaf) {
      if (options?.includeNomenclaturePrefix) {
        const prefix = extractNomenclaturePrefix(leaf);
        const fromLeafNoPrefix = fromLeaf.replace(
          NOMENCLATURE_PREFIX_PATTERN,
          "",
        );
        return prefix ? `${prefix}${fromLeafNoPrefix}` : fromLeaf;
      }
      return fromLeaf;
    }
    return stripIdDocumentoFromFileName(display, idDocumento);
  }
  return display || leaf || "documento";
};

interface IExpedienteLookup {
  nemotecnico: string;
  codExp: string;
}

/**
 * JOIN con Expedientes por IDExpediente para enriquecer resultados de búsqueda.
 * Consulta solo los IDs presentes en la página de resultados (no getAll).
 */
const loadExpedientesLookupByIds = async (
  idExpedientes: number[],
): Promise<Map<number, IExpedienteLookup>> => {
  const map = new Map<number, IExpedienteLookup>();
  const uniqueIds = Array.from(
    new Set(
      idExpedientes.filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!uniqueIds.length) return map;

  const CHUNK = 30;
  const list = sp.web.lists.getByTitle("Expedientes");
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK);
    const filter = chunk.map((id) => `IDExpediente eq ${id}`).join(" or ");
    try {
      const items: any[] = await list.items
        .filter(filter)
        .select("IDExpediente", "Nemotecnico", "CodExp")
        .top(chunk.length)
        .get();
      items.forEach((exp) => {
        const id = Number(exp.IDExpediente);
        if (!Number.isFinite(id) || id <= 0) return;
        map.set(id, {
          nemotecnico: String(exp.Nemotecnico || "").trim(),
          codExp: String(exp.CodExp || "").trim(),
        });
      });
    } catch (e) {
      console.warn(
        "No se pudieron cargar Nemotecnico/CodExp de Expedientes:",
        chunk,
        e,
      );
    }
  }
  return map;
};

const toServerRelativeUrl = (urlOrPath: string): string => {
  const raw = String(urlOrPath || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      return decodeURIComponent(new URL(raw).pathname).replace(/\/+$/, "");
    }
  } catch {
    // keep raw
  }
  return raw.replace(/\/+$/, "");
};

const AdvancedSearch: React.FC<IAdvancedSearchProps> = ({ context }) => {
  const PAGE_SIZE = 20;
  const [filters, setFilters] = React.useState<IAdvancedSearchFilters>({
    tituloDocumento: "",
    nombreArchivo: "",
    tipologiaDocumental: "",
    numeroDocumento: "",
    versionDocumento: "",
    nemotecnico: "",
    codExp: "",
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [results, setResults] = React.useState<IAdvancedSearchResult[]>([]);
  /** Resultados ya filtrados/deduplicados; la paginación es en cliente. */
  const [allResults, setAllResults] = React.useState<IAdvancedSearchResult[]>(
    [],
  );
  const [page, setPage] = React.useState(1);
  const [totalRows, setTotalRows] = React.useState(0);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [tiposDocumento, setTiposDocumento] = React.useState<
    ITipoDocumentoOption[]
  >([]);
  const [tiposDocumentoFiltrados, setTiposDocumentoFiltrados] = React.useState<
    ITipoDocumentoOption[]
  >([]);
  const [gruposDocumento, setGruposDocumento] = React.useState<
    IGrupoDocumentoOption[]
  >([]);
  const [grupoDocumentoFilter, setGrupoDocumentoFilter] = React.useState("");
  const [tipoDocumentoIdFilter, setTipoDocumentoIdFilter] = React.useState("");
  const [loadingGruposDocumento, setLoadingGruposDocumento] =
    React.useState(false);
  const [loadingTiposDocumento, setLoadingTiposDocumento] =
    React.useState(false);
  const [downloadingFileUrl, setDownloadingFileUrl] = React.useState("");

  const loadTiposDocumentoPorCarpeta = async (
    idCarpeta: number,
    catalog?: ITipoDocumentoOption[],
  ): Promise<ITipoDocumentoOption[]> => {
    try {
      setLoadingTiposDocumento(true);
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

      const source = catalog ?? tiposDocumento;
      const filtrados = source.filter((t) => idSet.has(t.IDTipoDocumento));
      setTiposDocumentoFiltrados(filtrados);
      return filtrados;
    } catch (err) {
      console.error(
        "Error cargando tipos de documento desde TipoDocumento_plantilla:",
        err,
      );
      setTiposDocumentoFiltrados([]);
      return [];
    } finally {
      setLoadingTiposDocumento(false);
    }
  };

  const cargarGruposDocumento = async (
    idTipoExpediente: number,
  ): Promise<IGrupoDocumentoOption[]> => {
    try {
      setLoadingGruposDocumento(true);
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

      setGruposDocumento(mapped);
      return mapped;
    } catch (err) {
      console.error(
        "Error cargando grupos de documento desde CarpetaExpediente:",
        err,
      );
      setGruposDocumento([]);
      return [];
    } finally {
      setLoadingGruposDocumento(false);
    }
  };

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const loadCatalogData = async (): Promise<void> => {
      try {
        const tipos: any[] = await sp.web.lists
          .getByTitle("TiposDocumentacion")
          .items.select("Id", "IDTipoDocumento", "Title", "Acronimo")
          .filter("Activo eq 1")
          .top(5000)
          .getAll();

        const mappedTipos: ITipoDocumentoOption[] = tipos
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

        setTiposDocumento(mappedTipos);
        setTiposDocumentoFiltrados([]);
        await cargarGruposDocumento(DEFAULT_ID_TIPO_EXPEDIENTE);
      } catch (e) {
        console.error("Error cargando catálogo de documentación:", e);
      }
    };
    loadCatalogData().catch(() => undefined);
  }, []);

  const onFilterChange = (
    field: keyof IAdvancedSearchFilters,
    value: string,
  ): void => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const enrichResultsWithExpedientes = async (
    rows: IAdvancedSearchResult[],
  ): Promise<IAdvancedSearchResult[]> => {
    if (!rows.length) return rows;
    try {
      const expIds = rows
        .map((r) => Number(r.idExpedienteDocumento))
        .filter((id) => Number.isFinite(id) && id > 0);
      const expLookup = await loadExpedientesLookupByIds(expIds);
      return rows.map((row) => {
        const id = Number(row.idExpedienteDocumento);
        const exp = expLookup.get(id);
        if (!exp) return row;
        return {
          ...row,
          nemotecnico: row.nemotecnico || exp.nemotecnico,
          codExp: row.codExp || exp.codExp,
        };
      });
    } catch (joinErr) {
      console.warn(
        "No se pudo enriquecer resultados con Expedientes (Nemotecnico/CodExp):",
        joinErr,
      );
      return rows;
    }
  };

  const applyPageSlice = async (
    source: IAdvancedSearchResult[],
    requestedPage: number,
  ): Promise<void> => {
    const safePage =
      Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const start = (safePage - 1) * PAGE_SIZE;
    const slice = source.slice(start, start + PAGE_SIZE);
    const enriched = await enrichResultsWithExpedientes(slice);
    setResults(enriched);
  };

  const onSearch = async (requestedPage?: number): Promise<void> => {
    if (grupoDocumentoFilter && !tipoDocumentoIdFilter) {
      setError(
        "La búsqueda solo por grupo de documentos no está soportada. Debe seleccionar un tipo de documentación.",
      );
      setResults([]);
      setAllResults([]);
      setTotalRows(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const currentPage =
        typeof requestedPage === "number" && requestedPage > 0
          ? requestedPage
          : page;
      const siteUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, "");
      const kqlParts: string[] = [
        `Path:"${siteUrl}/DocumentacionArchivo/*"`,
        "contentclass:STS_ListItem_DocumentLibrary",
        "IsDocument:1",
      ];

      const appendContains = (managedProp: string, value: string): void => {
        const clean = value.trim();
        if (!clean) return;
        kqlParts.push(`${managedProp}:"${escapeKqlValue(clean)}"`);
      };
      const appendFileNameContains = (value: string): void => {
        const clean = value.trim();
        if (!clean) return;
        kqlParts.push(`Filename:"*${escapeKqlValue(clean)}*"`);
      };

      appendContains(SEARCH_PROPS.tituloDocumento, filters.tituloDocumento);
      appendFileNameContains(filters.nombreArchivo);
      appendContains(
        SEARCH_PROPS.tipologiaDocumental,
        filters.tipologiaDocumental,
      );
      appendContains(SEARCH_PROPS.numeroDocumento, filters.numeroDocumento);
      appendContains(SEARCH_PROPS.versionDocumento, filters.versionDocumento);
      appendContains(SEARCH_PROPS.nemotecnico, filters.nemotecnico);
      appendContains(SEARCH_PROPS.codExp, filters.codExp);

      if (tipoDocumentoIdFilter) {
        kqlParts.push(
          `${SEARCH_PROPS.tipologiaDocumental}:"${escapeKqlValue(
            tipoDocumentoIdFilter,
          )}"`,
        );
      }

      const queryText = kqlParts.join(" AND ");
      const selectProperties = [
        "Title",
        "Path",
        "FileName",
        SEARCH_PROPS.idExpedienteDocumento,
        SEARCH_PROPS.tituloDocumento,
        SEARCH_PROPS.nombreDocumento,
        SEARCH_PROPS.tipologiaDocumental,
        SEARCH_PROPS.numeroDocumento,
        SEARCH_PROPS.versionDocumento,
        SEARCH_PROPS.ordinalE2E,
        SEARCH_PROPS.nemotecnico,
        SEARCH_PROPS.codExp,
      ];

      // Traer lotes del índice (KQL no soporta GROUP BY / MAX en servidor).
      const rawItems: Array<Record<string, unknown>> = [];
      let startRow = 0;
      while (startRow < SEARCH_MAX_RAW_ROWS) {
        const response = await sp.search({
          Querytext: queryText,
          RowLimit: SEARCH_FETCH_PAGE_SIZE,
          StartRow: startRow,
          TrimDuplicates: false,
          SelectProperties: selectProperties,
        });
        const batch = (response?.PrimarySearchResults || []) as Array<
          Record<string, unknown>
        >;
        rawItems.push(...batch);
        if (batch.length < SEARCH_FETCH_PAGE_SIZE) break;
        startRow += SEARCH_FETCH_PAGE_SIZE;
        if (rawItems.length >= SEARCH_MAX_RAW_ROWS) break;
      }

      let mapped: IAdvancedSearchResult[] = rawItems
        .slice(0, SEARCH_MAX_RAW_ROWS)
        .map((it, index) => ({
          id: Number(it.DocId || index + 1),
          idExpedienteDocumento: String(
            it[SEARCH_PROPS.idExpedienteDocumento] || "",
          ),
          tituloDocumento: String(it[SEARCH_PROPS.tituloDocumento] || ""),
          nombreDocumento: String(it[SEARCH_PROPS.nombreDocumento] || ""),
          tipologiaDocumental: String(
            it[SEARCH_PROPS.tipologiaDocumental] || "",
          ),
          numeroDocumento: String(it[SEARCH_PROPS.numeroDocumento] || ""),
          versionDocumento: String(it[SEARCH_PROPS.versionDocumento] || ""),
          ordinalE2E: String(it[SEARCH_PROPS.ordinalE2E] || ""),
          nemotecnico: String(it[SEARCH_PROPS.nemotecnico] || "").trim(),
          codExp: String(it[SEARCH_PROPS.codExp] || "").trim(),
          fileLeafRef: String(it.FileName || it.Title || ""),
          fileRef: String(it.Path || ""),
        }))
        .filter(hasCompleteVersionGroupKeys);

      // Si Versión está rellena, KQL ya filtró: no aplicar "solo la más alta".
      const versionFilterFilled = !!filters.versionDocumento.trim();
      if (!versionFilterFilled) {
        mapped = keepHighestVersionPerGroup(mapped);
      }

      setAllResults(mapped);
      setTotalRows(mapped.length);
      setPage(currentPage);

      if (
        mapped.length === 0 &&
        (filters.tituloDocumento ||
          filters.nombreArchivo ||
          filters.tipologiaDocumental ||
          filters.numeroDocumento ||
          filters.versionDocumento ||
          filters.nemotecnico ||
          filters.codExp ||
          tipoDocumentoIdFilter)
      ) {
        setError(
          "No hay resultados. Verifica que las propiedades administradas estén mapeadas e indexadas.",
        );
      }
    } catch (e) {
      console.error("Error buscando documentos:", e);
      setResults([]);
      setAllResults([]);
      setTotalRows(0);
      setError("No se pudieron cargar resultados con Search API.");
    } finally {
      setIsLoading(false);
    }
  };
  const onSearchClick = (): void => {
    if (grupoDocumentoFilter && !tipoDocumentoIdFilter) {
      setHasSearched(false);
      setResults([]);
      setAllResults([]);
      setTotalRows(0);
      setError(
        "La búsqueda solo por grupo de documentos no está soportada. Debe seleccionar un tipo de documentación.",
      );
      return;
    }
    setHasSearched(true);
    setPage(1);
    onSearch(1).catch(() => undefined);
  };
  const onClearClick = (): void => {
    setFilters({
      tituloDocumento: "",
      nombreArchivo: "",
      tipologiaDocumental: "",
      numeroDocumento: "",
      versionDocumento: "",
      nemotecnico: "",
      codExp: "",
    });
    setGrupoDocumentoFilter("");
    setTipoDocumentoIdFilter("");
    setTiposDocumentoFiltrados([]);
    setResults([]);
    setAllResults([]);
    setTotalRows(0);
    setPage(1);
    setHasSearched(false);
    setError("");
  };
  React.useEffect(() => {
    if (!hasSearched) return;
    applyPageSlice(allResults, page).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo re-paginar al cambiar página o el lote deduplicado
  }, [page, allResults, hasSearched]);

  const tiposDocumentoOptions = tiposDocumentoFiltrados;

  const tipoNombreById = React.useMemo(() => {
    const map: Record<string, string> = {};
    tiposDocumento.forEach((t) => {
      map[String(t.IDTipoDocumento)] = t.acronimo
        ? `${t.title} (${t.acronimo})`
        : t.title;
    });
    return map;
  }, [tiposDocumento]);
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const handleDownloadDocument = async (
    event: React.MouseEvent<HTMLAnchorElement>,
    row: IAdvancedSearchResult,
  ): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    const serverRelativeUrl = toServerRelativeUrl(row.fileRef);
    if (!serverRelativeUrl || downloadingFileUrl) return;

    try {
      setDownloadingFileUrl(serverRelativeUrl);
      let idDocumento: number | undefined;
      let tituloDocumento = String(row.tituloDocumento || "").trim();
      let fileLeafName = String(row.fileLeafRef || "").trim();

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
        // Usar datos del resultado de búsqueda.
      }

      if (!fileLeafName) {
        fileLeafName = serverRelativeUrl.split("/").pop() || "documento";
      }

      const downloadName = buildDocumentDownloadFileName(
        fileLeafName,
        idDocumento,
        tituloDocumento,
        { includeNomenclaturePrefix: true },
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

  return (
    <section className={styles.advancedSearch}>
      <h2 className={styles.title}>Buscador avanzado de documentos</h2>
      <div className={styles.filtersGrid}>
        <div className={styles.field}>
          <label>Grupo de documentos</label>
          <select
            value={grupoDocumentoFilter}
            onChange={(e) => {
              void (async () => {
                const value = e.target.value;
                setGrupoDocumentoFilter(value);
                setTipoDocumentoIdFilter("");
                setTiposDocumentoFiltrados([]);
                setError("");
                const idCarpeta = value ? Number(value) : NaN;
                if (!isNaN(idCarpeta)) {
                  await loadTiposDocumentoPorCarpeta(idCarpeta);
                }
              })();
            }}
            disabled={loadingGruposDocumento || gruposDocumento.length === 0}
          >
            <option value="">
              {loadingGruposDocumento
                ? "Cargando grupos..."
                : gruposDocumento.length
                  ? "Todos"
                  : "Sin grupos disponibles"}
            </option>
            {gruposDocumento.map((grupo) => (
              <option key={grupo.idCarpeta} value={String(grupo.idCarpeta)}>
                {grupo.title}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Tipo documentación</label>
          <select
            value={tipoDocumentoIdFilter}
            onChange={(e) => {
              setTipoDocumentoIdFilter(e.target.value);
              setError("");
            }}
            disabled={
              !grupoDocumentoFilter ||
              loadingTiposDocumento ||
              tiposDocumentoOptions.length === 0
            }
          >
            <option value="">
              {!grupoDocumentoFilter
                ? "Seleccione un grupo"
                : loadingTiposDocumento
                  ? "Cargando tipos..."
                  : tiposDocumentoOptions.length
                    ? "Todos"
                    : "Sin tipos disponibles"}
            </option>
            {tiposDocumentoOptions.map((tipo) => (
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
        <div className={styles.field}>
          <label>Título</label>
          <input
            value={filters.tituloDocumento}
            onChange={(e) => onFilterChange("tituloDocumento", e.target.value)}
          />
        </div>
        {/* <div className={styles.field}>
          <label>Tipología documental</label>
          <input
            value={filters.tipologiaDocumental}
            onChange={(e) =>
              onFilterChange("tipologiaDocumental", e.target.value)
            }
          />
        </div> */}
        <div className={styles.field}>
          <label>Archivo</label>
          <input
            value={filters.nombreArchivo}
            onChange={(e) => onFilterChange("nombreArchivo", e.target.value)}
            placeholder="Nombre del fichero"
          />
        </div>
        <div className={styles.field}>
          <label>Número documento</label>
          <input
            value={filters.numeroDocumento}
            onChange={(e) => onFilterChange("numeroDocumento", e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Versión</label>
          <input
            value={filters.versionDocumento}
            onChange={(e) => onFilterChange("versionDocumento", e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Nemotécnico</label>
          <input
            value={filters.nemotecnico}
            onChange={(e) => onFilterChange("nemotecnico", e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Nº de exp. corto</label>
          <input
            value={filters.codExp}
            onChange={(e) => onFilterChange("codExp", e.target.value)}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={onSearchClick} disabled={isLoading}>
          {isLoading ? "Buscando..." : "Buscar"}
        </button>
        <button type="button" onClick={onClearClick} disabled={isLoading}>
          Limpiar filtros
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nemotécnico</th>
              <th>Nº de exp. corto</th>
              <th>Titulo</th>
              <th>Tipo documentación</th>
              <th>Nº documento</th>
              <th>Versión</th>
              <th>Archivo</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>
                  {isLoading ? "Buscando documentos..." : "Sin resultados"}
                </td>
              </tr>
            ) : (
              results.map((row) => (
                <tr key={row.id}>
                  <td>{row.nemotecnico || "—"}</td>
                  <td>{row.codExp || "—"}</td>
                  <td>{row.tituloDocumento}</td>
                  <td>
                    {tipoNombreById[String(row.tipologiaDocumental)] ||
                      row.tipologiaDocumental}
                  </td>
                  <td>{row.numeroDocumento}</td>
                  <td>{row.versionDocumento}</td>
                  <td>
                    <a
                      href="#"
                      onClick={(e) => void handleDownloadDocument(e, row)}
                    >
                      {downloadingFileUrl === toServerRelativeUrl(row.fileRef)
                        ? "Descargando..."
                        : buildDocumentDisplayName(
                            row.tituloDocumento,
                            row.fileLeafRef,
                            { includeNomenclaturePrefix: true },
                          )}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasSearched && totalRows > 0 && totalPages > 1 && (
        <Pagination page={page} setPage={setPage} totalPages={totalPages} />
      )}
    </section>
  );
};

export default AdvancedSearch;
