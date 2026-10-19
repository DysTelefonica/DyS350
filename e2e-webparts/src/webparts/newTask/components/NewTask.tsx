// @ts-nocheck
import * as React from "react";
import styles from "./NewTask.module.scss";
import type { INewTaskProps, ITaskForm } from "./INewTaskProps";
import { IProjectForm } from "../../newProject/components/INewProjectProps";
import { ErrorAlert } from "../../../ui/errorAlert/ErrorAlert";
import { PeoplePicker } from "../../../ui/peoplePicker/PeoplePicker";
import ProjectDocumentation from "../../../ui/projectDocumentation/ProjectDocumentation";
import { resolveServerRelativeDocumentUrl } from "../../taskDetail/components/taskDocumentReplaceUtils";
import { DatePicker, DayOfWeek, IconButton } from "office-ui-fabric-react";
import { sp } from "@pnp/sp";
require("./pane.css");

const formatDateDisplay = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

const parseDisplayToDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const parts = value.split("/");
  if (parts.length !== 3) return undefined;
  const [day, month, year] = parts;
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return undefined;
  return new Date(y, m - 1, d);
};
const normalizeText = (value: unknown): string =>
  String(value || "").trim().toLowerCase();
const toBool = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "si" || raw === "sí";
};

interface IPlantillaTareaDocumental {
  id: number;
  idPlantilla: number;
  title: string;
  tituloTarea: string;
  descripcionTarea: string;
  esEntregable: boolean;
  tieneDeadline: boolean;
  requiereAprobacion: boolean;
  requiereFirma: boolean;
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

interface ITipoDocumentoOption {
  Id: number;
  IDTipoDocumento: number;
  Title: string;
  Acronimo?: string;
  Carpeta?: string;
  Versionable?: boolean;
}

interface ITareaPendienteTipo {
  idTarea: number;
  title: string;
  estado: string;
  responsable: string;
  elaborador: string;
  numeroDocumento: number | null;
  versionDocumento: number | null;
}

interface IVersionSourceDocument {
  fileRef: string;
  numeroDocumento: number;
  versionDocumento: number;
}

type VersionableDocMode = "nuevo" | "nuevaVersion" | null;

const parseSharePointNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value !== null && "Id" in value) {
    return parseSharePointNumber((value as { Id?: unknown }).Id);
  }
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
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

const buildCarpetaDestinoSegments = (
  idCarpetaGrupo: number,
  catalog: ICarpetaExpedienteItem[],
): string[] => {
  const byId = new Map<number, ICarpetaExpedienteItem>();
  catalog.forEach((entry) => byId.set(entry.idCarpeta, entry));

  const segments: string[] = [];
  const visited = new Set<number>();
  let currentId: number | null = idCarpetaGrupo;

  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);
    const node = byId.get(currentId);
    if (!node) break;
    segments.unshift(node.title);
    if (isIdPadreEmpty(node.idPadre)) break;
    currentId = parseSharePointNumber(node.idPadre);
  }

  return segments;
};

const buildCarpetaDestinoPath = (
  webServerRelativeUrl: string,
  proyectoId: string | number,
  idCarpetaGrupo: number,
  catalog: ICarpetaExpedienteItem[],
): string => {
  const segments = buildCarpetaDestinoSegments(idCarpetaGrupo, catalog);
  const relativePath = segments.join("/");
  const path = relativePath
    ? `DocumentacionArchivo/${proyectoId}/${relativePath}`
    : `DocumentacionArchivo/${proyectoId}`;
  const clean = path.trim().replace(/\/$/, "");
  if (!clean) return clean;
  if (clean.startsWith("/")) return clean;
  return `${webServerRelativeUrl}/${clean}`.replace(/\/{2,}/g, "/");
};

const getCarpetaRelativeDisplay = (
  serverRelativeUrl: string,
  proyectoId: string | number,
): string => {
  const normalized = String(serverRelativeUrl || "")
    .trim()
    .replace(/\/$/, "");
  const marker = `/DocumentacionArchivo/${proyectoId}`;
  const idx = normalized.indexOf(marker);
  if (idx >= 0) {
    return normalized.slice(idx + marker.length).replace(/^\//, "");
  }
  return normalized.split("/").slice(4).join("/");
};

const escapeODataSingleQuoted = (value: string): string =>
  String(value || "").replace(/'/g, "''");

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

const verifyDestinationFolderExists = async (
  webServerRelativeUrl: string,
  proyectoId: string | number,
  idCarpetaGrupo: number,
  catalog: ICarpetaExpedienteItem[],
): Promise<{ exists: boolean; resolvedUrl: string; expectedRelativePath: string }> => {
  const segments = buildCarpetaDestinoSegments(idCarpetaGrupo, catalog);
  const expectedRelativePath = segments.join("/");
  const expectedUrl = normalizeServerRelativePath(
    buildCarpetaDestinoPath(
      webServerRelativeUrl,
      proyectoId,
      idCarpetaGrupo,
      catalog,
    ),
  );
  const projectRoot = normalizeServerRelativePath(
    `${webServerRelativeUrl}/DocumentacionArchivo/${proyectoId}`,
  );

  try {
    await sp.web
      .getFolderByServerRelativePath(projectRoot)
      .select("ServerRelativeUrl")
      .get();
  } catch {
    return { exists: false, resolvedUrl: expectedUrl, expectedRelativePath };
  }

  let currentUrl = projectRoot;

  for (const segment of segments) {
    const trimmedSegment = String(segment || "").trim();
    if (!trimmedSegment) continue;

    let subfolders: any[] = [];
    try {
      subfolders = await sp.web
        .getFolderByServerRelativePath(currentUrl)
        .folders.filter("Name ne 'Forms'")
        .select("Name", "ServerRelativeUrl")
        .get();
    } catch {
      return { exists: false, resolvedUrl: expectedUrl, expectedRelativePath };
    }

    const match = subfolders.find(
      (folder) =>
        String(folder?.Name || "")
          .trim()
          .toLowerCase() === trimmedSegment.toLowerCase(),
    );

    if (!match?.ServerRelativeUrl) {
      return { exists: false, resolvedUrl: expectedUrl, expectedRelativePath };
    }

    currentUrl = normalizeServerRelativePath(String(match.ServerRelativeUrl));
  }

  return {
    exists: true,
    resolvedUrl: currentUrl,
    expectedRelativePath,
  };
};

const resolveNextNumeroDocumentoForAcronimo = async (
  idProyecto: number,
  acronimo: string,
): Promise<number> => {
  const trimmedAcronimo = String(acronimo || "").trim();
  const filter = trimmedAcronimo
    ? `IDProyecto eq ${idProyecto} and Acronimo eq '${escapeODataSingleQuoted(trimmedAcronimo)}'`
    : `IDProyecto eq ${idProyecto}`;

  const items: any[] = await sp.web.lists
    .getByTitle("TareasDocumentales")
    .items.filter(filter)
    .select("NumeroDocumento")
    .top(5000)
    .getAll();

  const maxNumero = items.reduce((acc, item) => {
    const parsed = Number(item?.NumeroDocumento);
    if (!Number.isNaN(parsed) && parsed > acc) return parsed;
    return acc;
  }, 0);

  return maxNumero + 1;
};

/** Huella de una alta de tarea para reintentos idempotentes en la misma sesión. */
const buildCreateTaskFingerprint = (params: {
  idProyecto: number;
  title: string;
  carpeta: string;
  idTipo: number | null;
  esVersionable: boolean;
  versionableDocMode: string | null;
  numeroDocumento?: number | null;
  versionDocumento?: number | null;
  elaborador: string;
  responsable: string;
}): string =>
  [
    params.idProyecto,
    String(params.title || "").trim().toLowerCase(),
    String(params.carpeta || "").trim().toLowerCase(),
    params.idTipo ?? "",
    params.esVersionable ? "1" : "0",
    params.versionableDocMode || "",
    params.numeroDocumento ?? "",
    params.versionDocumento ?? "",
    String(params.elaborador || "").trim().toLowerCase(),
    String(params.responsable || "").trim().toLowerCase(),
  ].join("|");

const getVersionSourceConflictMessage = (
  numeroDocumento: number,
  pendingTasks: ITareaPendienteTipo[],
): string => {
  const conflict = pendingTasks.find(
    (taskItem) =>
      taskItem.numeroDocumento !== null &&
      taskItem.numeroDocumento === numeroDocumento,
  );
  if (!conflict) return "";
  return `No se puede seleccionar este documento: la tarea ${conflict.idTarea} ("${conflict.title || "sin título"}") no está finalizada y ya usa el número documental ${numeroDocumento}.`;
};

const NewTask: React.FC<INewTaskProps> = ({ context }) => {
  const hoy = formatDateDisplay(new Date());
  const params = new URLSearchParams(window.location.search);
  const projectSelected = params.get("projectid");
  const tareaSelected = params.get("tareaid");
  const absolutePath = context.pageContext.web.absoluteUrl;
  const taskDetailUrl = tareaSelected
    ? `${absolutePath}/SitePages/detalle-tarea.aspx?tareaid=${encodeURIComponent(
        tareaSelected,
      )}`
    : "";
  const [error, setError] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [isSavingTask, setIsSavingTask] = React.useState(false);
  /** Lock síncrono anti doble-click (el state React no basta). */
  const isSavingTaskRef = React.useRef(false);
  /** Tras alta/actualización OK: el botón no se vuelve a habilitar hasta el redirect. */
  const [saveFinishedRedirecting, setSaveFinishedRedirecting] =
    React.useState(false);
  const saveFinishedRedirectingRef = React.useRef(false);
  /** Sesión de alta: permite reintentar Guardar sin crear otra tarea. */
  const createTaskSessionRef = React.useRef<{
    fingerprint: string;
    idTarea: number;
    spItemId: number;
    plantillaSaved?: boolean;
  } | null>(null);
  const [elaboradorSuggestions, setElaboradorSuggestions] = React.useState<
    any[]
  >([]);
  const [elaboradorPreselected, setElaboradorPreselected] = React.useState<
    any[]
  >([]);
  const [tiposDocumento, setTiposDocumento] = React.useState<
    ITipoDocumentoOption[]
  >([]);
  const [tiposDocumentoFiltrados, setTiposDocumentoFiltrados] = React.useState<
    ITipoDocumentoOption[]
  >([]);
  const [gruposDocumento, setGruposDocumento] = React.useState<
    IGrupoDocumentoOption[]
  >([]);
  const [carpetasExpedienteCatalog, setCarpetasExpedienteCatalog] =
    React.useState<ICarpetaExpedienteItem[]>([]);
  const [tipoExpedienteId, setTipoExpedienteId] = React.useState<number | null>(
    null,
  );
  const [documents, setDocuments] = React.useState([
    {
      // nombre: "",
      // descripcion: "",
      metadatos: {} as Record<number, string>,
    },
  ]);
  const [metadatosTipo, setMetadatosTipo] = React.useState<
    { IdTipoMetadato: number; Title: string; ValorMetadato?: string }[]
  >([]);
  const [patronesNomenclatura, setPatronesNomenclatura] = React.useState<
    { Id: number; Title: string; PatronNomenclatura: string }[]
  >([]);
  const [aprobadoresPreselected, setAprobadoresPreselected] = React.useState<
    any[]
  >([]);
  const [firmantesPreselected, setFirmantesPreselected] = React.useState<any[]>(
    [],
  );
  const [folderTree, setFolderTree] = React.useState<any[]>([]);
  const [currentFolderUrl, setCurrentFolderUrl] = React.useState<string | null>(
    null,
  );
  const [rootFolderUrl, setRootFolderUrl] = React.useState<string | null>(null);
  const [folderBreadcrumb, setFolderBreadcrumb] = React.useState<string[]>([]);
  const [selectedFolderUrl, setSelectedFolderUrl] = React.useState<
    string | null
  >(null);
  const [carpetaDestinoExists, setCarpetaDestinoExists] = React.useState<
    boolean | null
  >(null);
  const [carpetaDestinoError, setCarpetaDestinoError] = React.useState("");
  const [validatingCarpetaDestino, setValidatingCarpetaDestino] =
    React.useState(false);
  const carpetaDestinoVerificationRef = React.useRef(0);
  const [plantillasTarea, setPlantillasTarea] = React.useState<
    IPlantillaTareaDocumental[]
  >([]);
  const [selectedPlantillaId, setSelectedPlantillaId] = React.useState("");
  const [guardarPlantilla, setGuardarPlantilla] = React.useState(false);
  const [nombrePlantilla, setNombrePlantilla] = React.useState("");
  const [assignedTaskDocumentUrl, setAssignedTaskDocumentUrl] = React.useState<
    string | null
  >(null);
  const [selectedTaskDocumentUrl, setSelectedTaskDocumentUrl] = React.useState<
    string | null
  >(null);
  const [assignDocumentError, setAssignDocumentError] = React.useState("");
  const [tareasPendientesTipo, setTareasPendientesTipo] = React.useState<
    ITareaPendienteTipo[]
  >([]);
  const [loadingTareasPendientesTipo, setLoadingTareasPendientesTipo] =
    React.useState(false);
  const [tareasPendientesTipoError, setTareasPendientesTipoError] =
    React.useState("");
  const [versionableDocMode, setVersionableDocMode] =
    React.useState<VersionableDocMode>(null);
  const [selectedVersionSourceDoc, setSelectedVersionSourceDoc] =
    React.useState<IVersionSourceDocument | null>(null);
  const [versionSourceDocError, setVersionSourceDocError] = React.useState("");
  // const [singleExp, setExp] = React.useState<IProjectForm>();
  //  const [expedientes, setExpedientes] = React.useState<IProjectForm[]>([]);
  const currentUserName = context.pageContext.user.displayName || "";
  const webServerRelativeUrl =
    context.pageContext.web.serverRelativeUrl.replace(/\/$/, "");

  const [task, setTask] = React.useState<ITaskForm>({
    proyectoId: projectSelected,
    proyectoNombre: "",

    nombre: "",
    descripcion: "",

    fechaInicio: hoy,
    fechaFin: "",

    estado: "AltaTareaDoc",
    responsable: currentUserName,
    elaborador: "",

    tipoDocumento: "",
    carpeta: "",
    carpetaDocumento: "",
    esVersionable: false,

    patronNomenclatura: "",
    entregable: false,

    fechaEntrega: "",

    tieneDeadline: false,
    fechaDeadline: "",

    requiereAprobacion: false,
    aprobadores: [],

    requiereFirma: false,
    firmantes: [],

    convertirAPDF: false,

    parrafoBloqueado: "Párrafo bloqueado por Inmaculada Palacios Rubio",

    docName: "",
    docDescription: "",
  });

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  const loadTiposDocumentoPorCarpeta = async (
    idCarpeta: number,
    catalog?: ITipoDocumentoOption[],
  ): Promise<ITipoDocumentoOption[]> => {
    try {
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
    }
  };

  const cargarGruposDocumento = async (
    idTipoExpediente: number,
  ): Promise<IGrupoDocumentoOption[]> => {
    try {
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

      setCarpetasExpedienteCatalog(catalog);
      setGruposDocumento(mapped);
      return mapped;
    } catch (err) {
      console.error("Error cargando grupos de documento desde CarpetaExpediente:", err);
      setCarpetasExpedienteCatalog([]);
      setGruposDocumento([]);
      return [];
    }
  };

  const resolveIdCarpetaPorTipoDocumento = async (
    idTipoDocumento: number,
  ): Promise<number | null> => {
    try {
      const links: any[] = await sp.web.lists
        .getByTitle("TipoDocumento_plantilla")
        .items.filter(`IDTipoDocumento eq ${idTipoDocumento}`)
        .select("IDCarpeta")
        .top(1)
        .get();
      return parseSharePointNumber(links[0]?.IDCarpeta);
    } catch {
      return null;
    }
  };

  const proyectoIdActivo = task.proyectoId || projectSelected || "";

  const carpetaDestinoDisplay = React.useMemo(() => {
    const idCarpeta = parseSharePointNumber(task.carpetaDocumento);
    if (!proyectoIdActivo || idCarpeta === null || !carpetasExpedienteCatalog.length) {
      return "";
    }
    const url = buildCarpetaDestinoPath(
      webServerRelativeUrl,
      proyectoIdActivo,
      idCarpeta,
      carpetasExpedienteCatalog,
    );
    return getCarpetaRelativeDisplay(url, proyectoIdActivo);
  }, [
    task.carpetaDocumento,
    proyectoIdActivo,
    carpetasExpedienteCatalog,
    webServerRelativeUrl,
  ]);

  React.useEffect(() => {
    const idCarpeta = parseSharePointNumber(task.carpetaDocumento);
    if (!proyectoIdActivo || idCarpeta === null) {
      setSelectedFolderUrl(null);
      setCarpetaDestinoExists(null);
      setCarpetaDestinoError("");
      setValidatingCarpetaDestino(false);
      return;
    }

    if (!carpetasExpedienteCatalog.length) {
      setSelectedFolderUrl(null);
      setCarpetaDestinoExists(null);
      setCarpetaDestinoError("");
      setValidatingCarpetaDestino(true);
      return;
    }

    const verificationId = ++carpetaDestinoVerificationRef.current;

    const verifyDestinationFolder = async (): Promise<void> => {
      setValidatingCarpetaDestino(true);
      setCarpetaDestinoError("");
      setCarpetaDestinoExists(null);
      setSelectedFolderUrl(null);

      try {
        const result = await verifyDestinationFolderExists(
          webServerRelativeUrl,
          proyectoIdActivo,
          idCarpeta,
          carpetasExpedienteCatalog,
        );

        if (verificationId !== carpetaDestinoVerificationRef.current) return;

        if (result.exists) {
          setCarpetaDestinoExists(true);
          setSelectedFolderUrl(result.resolvedUrl);
          setCarpetaDestinoError("");
          return;
        }

        const rutaRelativa = result.expectedRelativePath
          ? `DocumentacionArchivo/${proyectoIdActivo}/${result.expectedRelativePath}`
          : `DocumentacionArchivo/${proyectoIdActivo}`;

        setCarpetaDestinoExists(false);
        setSelectedFolderUrl(null);
        setCarpetaDestinoError(
          `La carpeta de destino no existe en la biblioteca DocumentacionArchivo (${rutaRelativa}). Revise la configuración del expediente o contacte con el administrador.`,
        );
      } catch (err) {
        console.error("Error verificando carpeta de destino:", err);
        if (verificationId !== carpetaDestinoVerificationRef.current) return;

        const fallbackUrl = buildCarpetaDestinoPath(
          webServerRelativeUrl,
          proyectoIdActivo,
          idCarpeta,
          carpetasExpedienteCatalog,
        );
        const displayPath = getCarpetaRelativeDisplay(fallbackUrl, proyectoIdActivo);
        const rutaRelativa = displayPath
          ? `DocumentacionArchivo/${proyectoIdActivo}/${displayPath}`
          : `DocumentacionArchivo/${proyectoIdActivo}`;

        setCarpetaDestinoExists(false);
        setSelectedFolderUrl(null);
        setCarpetaDestinoError(
          `No se ha podido verificar la carpeta de destino (${rutaRelativa}). Revise la configuración del expediente o contacte con el administrador.`,
        );
      } finally {
        if (verificationId === carpetaDestinoVerificationRef.current) {
          setValidatingCarpetaDestino(false);
        }
      }
    };

    void verifyDestinationFolder();
  }, [
    task.carpetaDocumento,
    proyectoIdActivo,
    carpetasExpedienteCatalog,
    webServerRelativeUrl,
  ]);

  const loadPlantillasTarea = async (): Promise<void> => {
    try {
      const items: any[] = await sp.web.lists
        .getByTitle("PlantillasTareasDocumentales")
        .items.select(
          "ID",
          "IDPlantillaTareaDocumental",
          "Title",
          "TituloTarea",
          "DescripcionTarea",
          "EsEntregable",
          "TieneDeadline",
          "RequiereAprobacion",
          "RequiereFirma",
        )
        .top(5000)
        .getAll();

      const mapped: IPlantillaTareaDocumental[] = items.map((it) => ({
        id: Number(it.ID),
        idPlantilla: Number(it.IDPlantillaTareaDocumental || it.ID || 0),
        title: String(it.Title || ""),
        tituloTarea: String(it.TituloTarea || ""),
        descripcionTarea: String(it.DescripcionTarea || ""),
        esEntregable: toBool(it.EsEntregable),
        tieneDeadline: toBool(it.TieneDeadline),
        requiereAprobacion: toBool(it.RequiereAprobacion),
        requiereFirma: toBool(it.RequiereFirma),
      }));

      setPlantillasTarea(mapped);
    } catch (e) {
      console.error("Error cargando PlantillasTareasDocumentales:", e);
    }
  };

  const toServerRelativeUrl = (folderUrl: string): string => {
    const clean = (folderUrl || "").trim().replace(/\/$/, "");
    if (!clean) return clean;
    if (clean.startsWith("/")) return clean;
    return `${webServerRelativeUrl}/${clean}`.replace(/\/{2,}/g, "/");
  };

  const loadFolderLevel = async (
    folderUrl: string,
    rootUrl?: string,
  ): Promise<void> => {
    const normalizedFolderUrl = toServerRelativeUrl(folderUrl);
    const folder = sp.web.getFolderByServerRelativePath(normalizedFolderUrl);
    const subFolders: any[] = await folder.folders
      .filter("Name ne 'Forms'")
      .select("Name,ServerRelativeUrl")
      .get();

    setFolderTree(
      subFolders.map((f) => ({
        name: f.Name as string,
        serverRelativeUrl: f.ServerRelativeUrl as string,
      })),
    );
    setCurrentFolderUrl(normalizedFolderUrl);

    const base = toServerRelativeUrl(rootUrl || rootFolderUrl || "");
    if (base) {
      const rel = normalizedFolderUrl.startsWith(`${base}/`)
        ? normalizedFolderUrl.substring(base.length + 1)
        : normalizedFolderUrl === base
          ? ""
          : normalizedFolderUrl;
      setFolderBreadcrumb(rel ? rel.split("/").filter(Boolean) : []);
    }
  };

  const getData = async (
    expedienteId: string,
  ): Promise<ITipoDocumentoOption[]> => {
    setError("");
    if (!expedienteId) return [];
    try {
      // Obtener título del expediente desde la lista "Expedientes"
      const expItems: any[] = await sp.web.lists
        .getByTitle("Expedientes")
        .items.filter(`IDExpediente eq ${expedienteId}`)
        .select("Title", "PatronNomenclatura", "IDTipoExpediente")
        .top(1)
        .get();

      const proyectoTitulo = expItems[0]?.Title || "";
      const patronNomenclatura = expItems[0]?.PatronNomenclatura ?? "";
      const tipoExpedienteRaw =
        expItems[0]?.TipoExpedienteId ?? expItems[0]?.IDTipoExpediente;
      const tipoExpedienteNum = parseSharePointNumber(tipoExpedienteRaw);
      setTipoExpedienteId(tipoExpedienteNum);
      if (tipoExpedienteNum !== null) {
        await cargarGruposDocumento(tipoExpedienteNum);
      } else {
        setCarpetasExpedienteCatalog([]);
        setGruposDocumento([]);
      }

      // Cargar sugerencias de elaborador desde Roles_usuario (todos los integrantes del expediente)
      const roles: any[] = await sp.web.lists
        .getByTitle("Roles_usuario")
        .items.filter(`IDExpediente eq ${expedienteId}`)
        .select("Title", "IDRol", "usuario")
        .top(5000)
        .getAll();

      const uniqueNames = Array.from(
        new Set(
          roles
            .map((r) => (r.Title as string) || (r.usuario as string) || "")
            .map((name) => String(name || "").trim())
            .filter((name) => !!name),
        ),
      );

      const suggestions = uniqueNames.map((name: any) => ({
        key: name,
        text: name,
      }));

      setElaboradorSuggestions(suggestions);

      // Jefe de proyecto como elaborador preseleccionado (IDRol resuelto dinámicamente desde la lista Roles)
      const rolesCatalog: any[] = await sp.web.lists
        .getByTitle("Roles")
        .items.select("Title", "IDRol")
        .top(5000)
        .getAll();
      const jefeCatalog = rolesCatalog.find(
        (r) => normalizeText(r?.Title) === normalizeText("Jefe de proyecto"),
      );
      const jefeRolId = Number(jefeCatalog?.IDRol);
      const jefeRole = roles.find((r) => Number(r?.IDRol) === jefeRolId)
        ?.Title as string | undefined;

      const preselected =
        jefeRole && suggestions.length
          ? suggestions.filter((s) => s.text === jefeRole)
          : jefeRole
            ? [{ key: jefeRole, text: jefeRole }]
            : suggestions.length > 0
              ? [suggestions[0]]
              : [];

      setElaboradorPreselected(preselected);

      // Cargar árbol de carpetas desde la biblioteca "DocumentacionArchivo" para este expediente
      const rootUrl = toServerRelativeUrl(`DocumentacionArchivo/${expedienteId}`);
      setRootFolderUrl(rootUrl);
      setCurrentFolderUrl(rootUrl);
      setFolderBreadcrumb([]);
      setSelectedFolderUrl(null);
      await loadFolderLevel(rootUrl, rootUrl);
      
      // Cargar tipos de documento desde la lista TiposDocumentacion
      const tipos: any[] = await sp.web.lists
        .getByTitle("TiposDocumentacion")
        .items.select(
          "Id",
          "IDTipoDocumento",
          "Title",
          "Acronimo",
          "Carpeta",
          "Versionable",
          "Activo",
        )
        .filter("Activo eq 1")
        .top(5000)
        .getAll();
      const mappedTipos: ITipoDocumentoOption[] = tipos.map((t) => ({
        Id: t.Id as number,
        IDTipoDocumento: t.IDTipoDocumento as number,
        Title: t.Title.trim() as string,
        Acronimo: ((t.Acronimo as string) || "").trim(),
        Carpeta: (t?.Carpeta?.trim() as string) || "",
        Versionable: !!t.Versionable,
      }));

      setTiposDocumento(mappedTipos);
      setTiposDocumentoFiltrados([]);

      // Cargar patrones de nomenclatura desde la lista PatronesNomenclatura
      try {
        const patronesItems: any[] = await sp.web.lists
          .getByTitle("PatronesNomenclatura")
          .items.select("Id", "Title", "PatronNomenclatura")
          .top(5000)
          .getAll();
        setPatronesNomenclatura(
          patronesItems.map((p) => ({
            Id: p.Id as number,
            Title: (p.Title as string) || "",
            PatronNomenclatura: (p.PatronNomenclatura as string) || "",
          })),
        );
      } catch (e) {
        console.error("Error cargando patrones de nomenclatura en NewTask:", e);
      }

      setTask((prev) => ({
        ...prev,
        proyectoNombre: proyectoTitulo,
        // En alta usamos el ID del patrón del expediente (FK), en edición respetamos el ya cargado desde TareasDocumentales
        patronNomenclatura:
          prev.patronNomenclatura ||
          (patronNomenclatura ?? prev.patronNomenclatura),
        elaborador:
          prev.elaborador || jefeRole || String(preselected[0]?.text || ""),
      }));
      return mappedTipos;
    } catch (err) {
      console.log(err, "error");
      setError("No se ha podido obtener la información del expediente.");
      return [];
    }
  };

  React.useEffect(() => {
    const loadExistingTask = async () => {
      try {
        setError("");
        if (!tareaSelected) return;

        const tareaNum = parseInt(tareaSelected, 10);
        if (isNaN(tareaNum)) {
          setError("ID de tarea no válido.");
          return;
        }

        const list = sp.web.lists.getByTitle("TareasDocumentales");
        const items: any[] = await list.items
          .filter(`IDTarea eq ${tareaNum}`)
          .select(
            "IDTarea",
            "Title",
            "IDProyecto",
            "FechaInicioTarea",
            "FechaFinTarea",
            "EstadoTarea",
            "Responsable",
            "DescripcionTarea",
            "Carpeta",
            "IDTipo",
            "PatronNomenclatura",
            "EsEntregable",
            "FechaEntrega",
            "TieneDeadline",
            "FechaDeadline",
            "RequiereAprobacion",
            "RequiereFirma",
            "ConvertirAPDF",
            "EsVersionable",
            "Elaborador",
            "ListaAprobadores",
            "ListaFirmantes",
            "IDPlantillaTareaDocumental",
          )
          .top(1)
          .get();

        if (!items.length) {
          setError("No se ha encontrado la tarea para editar.");
          return;
        }

        const item = items[0];
        const idProyecto = item.IDProyecto as number | undefined;
        const plantillaIdRaw = item.IDPlantillaTareaDocumental;
        const plantillaIdNum = Number(plantillaIdRaw);

        let tiposCatalog: ITipoDocumentoOption[] = [];
        if (idProyecto !== undefined && idProyecto !== null) {
          tiposCatalog = await getData(String(idProyecto));
        }

        const carpeta = (item.Carpeta as string) || "";
        if (carpeta) {
          setSelectedFolderUrl(toServerRelativeUrl(carpeta));
        }

        let tipoNombre = "";
        let idCarpetaGrupo: number | null = null;
        let metadatosTipoActuales: {
          IdTipoMetadato: number;
          Title: string;
          ValorMetadato?: string;
        }[] = [];
        const idTipo = item.IDTipo as number | undefined;
        if (idTipo !== undefined && idTipo !== null) {
          try {
            const tipoItem: any = await sp.web.lists
              .getByTitle("TiposDocumentacion")
              .items.filter(`IDTipoDocumento eq ${idTipo} and Activo eq 1`)
              .select("Title")
              .top(1)
              .get();
            tipoNombre = ((tipoItem[0]?.Title as string) || "").trim();
            idCarpetaGrupo = await resolveIdCarpetaPorTipoDocumento(idTipo);
            if (idCarpetaGrupo !== null) {
              await loadTiposDocumentoPorCarpeta(idCarpetaGrupo, tiposCatalog);
            }
          } catch {
            tipoNombre = "";
            idCarpetaGrupo = null;
          }

          try {
            const metas: any[] = await sp.web.lists
              .getByTitle("MetadatosTiposDocumentos")
              .items.filter(`IDTipoDocumento eq ${idTipo}`)
              .select("IDTipoMetadato", "Title", "ValorMetadato")
              .top(5000)
              .getAll();
            const mappedMetas = metas.map((m) => ({
              IdTipoMetadato: m.IDTipoMetadato as number,
              Title: m.Title as string,
              ValorMetadato: (m.ValorMetadato as string) || "",
            }));
            metadatosTipoActuales = mappedMetas;
            setMetadatosTipo(mappedMetas);
          } catch {
            // ignore
          }
        }

        const aprobadoresArr =
          ((item.ListaAprobadores as string) || "")
            .split(/[;\r\n]+/)
            .map((s) => s.trim())
            .filter(Boolean) || [];
        const firmantesArr =
          ((item.ListaFirmantes as string) || "")
            .split(/[;\r\n]+/)
            .map((s) => s.trim())
            .filter(Boolean) || [];

        setAprobadoresPreselected(
          aprobadoresArr.map((name) => ({ key: name, text: name })),
        );
        setFirmantesPreselected(
          firmantesArr.map((name) => ({ key: name, text: name })),
        );

        const elaboradorStr = (item.Elaborador as string) || "";
        if (elaboradorStr) {
          const elaboradores =
            elaboradorStr
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean) || [];
          setElaboradorPreselected(
            elaboradores.map((name) => ({ key: name, text: name })),
          );
        }

        // PatronNomenclatura viene guardado como FK (ID) pero SharePoint puede devolverlo con distintas claves.
        const patronNomenclaturaRawId =
          item.PatronNomenclaturaId ??
          item.PatronNomenclatura?.Id ??
          item.PatronNomenclatura;
        const patronNomenclaturaIdNum =
          patronNomenclaturaRawId != null &&
          patronNomenclaturaRawId !== "" &&
          !Number.isNaN(Number(patronNomenclaturaRawId))
            ? Number(patronNomenclaturaRawId)
            : null;

        const patronNomenclaturaStr =
          patronNomenclaturaIdNum != null
            ? String(patronNomenclaturaIdNum)
            : "";

        const toDisplay = (value: string | undefined): string => {
          if (!value) return "";
          const [datePart] = String(value).split("T");
          const [y, m, d] = datePart.split("-");
          if (!y || !m || !d) return "";
          return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
        };

        setTask((prev) => ({
          ...prev,
          proyectoId:
            idProyecto !== undefined && idProyecto !== null
              ? String(idProyecto)
              : prev.proyectoId,
          nombre: (item.Title as string) || "",
          descripcion: (item.DescripcionTarea as string) || "",
          fechaInicio: item.FechaInicioTarea
            ? toDisplay(item.FechaInicioTarea as string)
            : prev.fechaInicio,
          fechaFin: item.FechaFinTarea
            ? toDisplay(item.FechaFinTarea as string)
            : "",
          estado: (item.EstadoTarea as string) || prev.estado,
          responsable: (item.Responsable as string) || prev.responsable,
          elaborador: elaboradorStr || prev.elaborador,
          carpetaDocumento:
            idCarpetaGrupo !== null
              ? String(idCarpetaGrupo)
              : prev.carpetaDocumento,
          tipoDocumento: tipoNombre,
          esVersionable: !!item.EsVersionable,
          carpeta,
          patronNomenclatura: patronNomenclaturaStr,
          entregable: !!item.EsEntregable,
          // fechaEntrega: item.FechaEntrega
          //   ? toDisplay(item.FechaEntrega as string)
          //   : "",
          tieneDeadline: !!item.TieneDeadline,
          fechaDeadline: item.FechaDeadline
            ? toDisplay(item.FechaDeadline as string)
            : "",
          requiereAprobacion: !!item.RequiereAprobacion,
          aprobadores: aprobadoresArr,
          requiereFirma: !!item.RequiereFirma,
          firmantes: firmantesArr,
          convertirAPDF: !!item.ConvertirAPDF && !item.RequiereFirma,
        }));

        if (!Number.isNaN(plantillaIdNum) && plantillaIdNum > 0) {
          setSelectedPlantillaId(String(plantillaIdNum));
        } else {
          setSelectedPlantillaId("");
        }

        // Cargar documentos y sus metadatos
        const docs: any[] = await sp.web.lists
          .getByTitle("DocumentoPrincipal")
          .items.filter(`IDTarea eq ${tareaNum}`)
          .select("IDDocumento", "Title", "UrlDocumento")
          .top(5000)
          .getAll();

        const assignedDocUrlRaw = String(docs[0]?.UrlDocumento || "").trim();
        const assignedDocUrl = resolveServerRelativeDocumentUrl(
          assignedDocUrlRaw,
          webServerRelativeUrl,
        );
        setAssignedTaskDocumentUrl(assignedDocUrl || null);
        setSelectedTaskDocumentUrl(assignedDocUrl || null);
        setAssignDocumentError("");

        if (docs.length) {
          const docsWithMetas = await Promise.all(
            docs.map(async (d) => {
              const metas: any[] = await sp.web.lists
                .getByTitle("MetadatosDocumentos")
                .items.filter(`IDDocumento eq ${d.IDDocumento}`)
                .select("Title", "ValorMetadato")
                .top(5000)
                .getAll();
              const metadatos: Record<number, string> = {};
              const normalizeMetaTitle = (value: unknown): string =>
                String(value || "")
                  .trim()
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "");
              metas.forEach((m) => {
                const titleNorm = normalizeMetaTitle(m.Title);
                const def = metadatosTipoActuales.find(
                  (metaDef) => normalizeMetaTitle(metaDef.Title) === titleNorm,
                );
                if (!def) return;
                metadatos[def.IdTipoMetadato] =
                  (m.ValorMetadato as string) || "";
              });
              return {
                nombre: (d.Title as string) || "",
                // descripcion: (d.Descripcion as string) || "",
                metadatos,
              };
            }),
          );
          setDocuments(docsWithMetas);
        }
      } catch (err) {
        console.error("Error cargando tarea para edición:", err);
        setError("No se ha podido cargar la tarea para edición.");
      }
    };

    void loadExistingTask();
  }, [tareaSelected]);

  const handleChange = React.useCallback((field: keyof ITaskForm, value: any) => {
    if (field === "requiereAprobacion") {
      const checked = !!value;
      setTask((prev) => ({
        ...prev,
        requiereAprobacion: checked,
        aprobadores: checked ? prev.aprobadores : [],
      }));
      if (!checked) {
        setAprobadoresPreselected([]);
      }
      return;
    }

    if (field === "requiereFirma") {
      const checked = !!value;
      setTask((prev) => ({
        ...prev,
        requiereFirma: checked,
        firmantes: checked ? prev.firmantes : [],
        // Con firma no aplica conversión a PDF en alta/edición.
        convertirAPDF: checked ? false : prev.convertirAPDF,
      }));
      if (!checked) {
        setFirmantesPreselected([]);
      }
      return;
    }

    if (field === "tieneDeadline") {
      const checked = !!value;
      setTask((prev) => ({
        ...prev,
        tieneDeadline: checked,
        fechaDeadline: checked ? prev.fechaDeadline : "",
      }));
      return;
    }

    setTask((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetVersionableDocFlow = (): void => {
    setVersionableDocMode(null);
    setSelectedVersionSourceDoc(null);
    setVersionSourceDocError("");
  };

  const handleVersionSourceSelection = (payload: {
    selectedFileUrls?: string[];
    selectedFileMetadata?: {
      numeroDocumento: number | null;
      versionDocumento: number | null;
    } | null;
  }): void => {
    const selectedUrl =
      payload.selectedFileUrls && payload.selectedFileUrls.length > 0
        ? payload.selectedFileUrls[payload.selectedFileUrls.length - 1]
        : null;
    const metadata = payload.selectedFileMetadata;

    if (
      !selectedUrl ||
      metadata?.numeroDocumento == null ||
      metadata?.versionDocumento == null
    ) {
      setSelectedVersionSourceDoc(null);
      setVersionSourceDocError("");
      return;
    }

    const numeroDocumento = Number(metadata.numeroDocumento);
    const versionDocumento = Number(metadata.versionDocumento);
    if (Number.isNaN(numeroDocumento) || Number.isNaN(versionDocumento)) {
      setSelectedVersionSourceDoc(null);
      setVersionSourceDocError("");
      return;
    }

    const conflictMessage = getVersionSourceConflictMessage(
      numeroDocumento,
      tareasPendientesTipo,
    );
    if (conflictMessage) {
      setSelectedVersionSourceDoc(null);
      setVersionSourceDocError(conflictMessage);
      return;
    }

    setSelectedVersionSourceDoc({
      fileRef: selectedUrl,
      numeroDocumento,
      versionDocumento,
    });
    setVersionSourceDocError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      isSavingTaskRef.current ||
      isSavingTask ||
      saveFinishedRedirectingRef.current ||
      saveFinishedRedirecting
    ) {
      return;
    }

    setError("");
    setSuccessMessage("");
    const isEdit = !!tareaSelected;
    const title = (task.nombre || "").trim();
    if (!title) {
      setError("El nombre de la tarea es obligatorio.");
      return;
    }

    if (!(task.fechaFin || "").trim()) {
      setError("La fecha fin es obligatoria.");
      return;
    }

    const elaboradoresSeleccionados = String(task.elaborador || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (elaboradoresSeleccionados.length === 0) {
      setError("Debes seleccionar al menos un elaborador.");
      return;
    }

    const aprobadoresSeleccionados = (task.aprobadores || [])
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    if (task.requiereAprobacion && aprobadoresSeleccionados.length === 0) {
      setError(
        "Si la tarea requiere aprobación, debes seleccionar al menos un aprobador.",
      );
      return;
    }

    const firmantesSeleccionados = (task.firmantes || [])
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    if (task.requiereFirma && firmantesSeleccionados.length === 0) {
      setError(
        "Si la tarea requiere firma, debes seleccionar al menos un firmante.",
      );
      return;
    }

    if (task.tieneDeadline && !(task.fechaDeadline || "").trim()) {
      setError(
        "Si la tarea tiene deadline, debes seleccionar una fecha en Fecha deadline.",
      );
      return;
    }
    if (!isEdit && guardarPlantilla && !String(nombrePlantilla || "").trim()) {
      setError("Si marcas Guardar plantilla, debes indicar un nombre de plantilla.");
      return;
    }

    try {
      isSavingTaskRef.current = true;
      setIsSavingTask(true);
      const listTitle = "TareasDocumentales";
      const list = sp.web.lists.getByTitle(listTitle);

      let idProyecto: number | null = null;
      let idTarea: number;
      let spItemId: number | null = null;
      let resumeCreate = false;

      if (isEdit && tareaSelected) {
        const tareaIdNum = parseInt(tareaSelected, 10);
        if (isNaN(tareaIdNum)) {
          setError("ID de tarea no válido.");
          return;
        }

        const existing: any[] = await list.items
          .filter(`IDTarea eq ${tareaIdNum}`)
          .select("ID", "IDTarea", "IDProyecto")
          .top(1)
          .get();

        if (!existing.length) {
          setError("No se ha encontrado la tarea a editar.");
          return;
        }

        const item = existing[0];
        idTarea = item.IDTarea as number;
        idProyecto =
          (item.IDProyecto as number) ??
          (projectSelected ? parseInt(projectSelected, 10) : null);
        spItemId = item.ID as number;
      } else {
        if (!projectSelected) {
          setError("Falta el expediente (projectid).");
          return;
        }
        const parsedProyecto = parseInt(projectSelected, 10);
        if (isNaN(parsedProyecto)) {
          setError("ID de proyecto no válido.");
          return;
        }
        idProyecto = parsedProyecto;

        // Placeholder; se resuelve tras conocer carpeta/tipo (más abajo) o se reanuda.
        idTarea = 0;
      }

      if (idProyecto === null) {
        setError("No se ha podido determinar el proyecto de la tarea.");
        return;
      }

      // IDTipo desde tipo de documento seleccionado
      const tipoSeleccionado = tiposDocumentoFiltrados.find(
        (t) => t.Title === task.tipoDocumento,
      ) || tiposDocumento.find((t) => t.Title === task.tipoDocumento);
      const idTipo = tipoSeleccionado?.IDTipoDocumento ?? null;
      const proyectoIdParaCarpeta = task.proyectoId || projectSelected || "";
      const idCarpetaGrupo = parseSharePointNumber(task.carpetaDocumento);
      const carpetaSeleccionada =
        selectedFolderUrl ||
        (proyectoIdParaCarpeta &&
        idCarpetaGrupo !== null &&
        carpetasExpedienteCatalog.length
          ? buildCarpetaDestinoPath(
              webServerRelativeUrl,
              proyectoIdParaCarpeta,
              idCarpetaGrupo,
              carpetasExpedienteCatalog,
            )
          : "");

      const patronNomenclatura = task.patronNomenclatura;
      const plantillaTareaIdNum = Number(selectedPlantillaId);

      if (!isEdit && !carpetaSeleccionada) {
        setError(
          "Debes seleccionar un grupo de documentos antes de crear la tarea.",
        );
        return;
      }

      if (!isEdit && validatingCarpetaDestino) {
        setError(
          "Se está verificando la carpeta de destino. Espere un momento e intente de nuevo.",
        );
        return;
      }

      if (!isEdit && task.carpetaDocumento && carpetaDestinoExists === false) {
        setError(
          carpetaDestinoError ||
            "La carpeta de destino no existe en la biblioteca DocumentacionArchivo.",
        );
        return;
      }

      if (
        !isEdit &&
        (!task.esVersionable ||
          (task.esVersionable && versionableDocMode === "nuevo"))
      ) {
        if (!task.carpetaDocumento || idTipo === null || idTipo === undefined) {
          setError(
            "Debes seleccionar grupo y tipo de documento antes de crear la tarea.",
          );
          return;
        }
      }

      if (!isEdit && task.esVersionable) {
        if (!versionableDocMode) {
          setError(
            "Debe indicar si el documento es nuevo o una nueva versión de un documento existente.",
          );
          return;
        }
        if (versionableDocMode === "nuevaVersion") {
          if (versionSourceDocError) {
            setError(versionSourceDocError);
            return;
          }
          if (!selectedVersionSourceDoc) {
            setError(
              "Debe seleccionar un documento base para crear la nueva versión.",
            );
            return;
          }
          const conflictOnSave = getVersionSourceConflictMessage(
            selectedVersionSourceDoc.numeroDocumento,
            tareasPendientesTipo,
          );
          if (conflictOnSave) {
            setVersionSourceDocError(conflictOnSave);
            setError(conflictOnSave);
            return;
          }
        }
      }

      // Idempotencia (alta): reutilizar tarea ya creada en esta sesión o en SharePoint.
      if (!isEdit && idProyecto !== null) {
        const plannedNumero =
          task.esVersionable &&
          versionableDocMode === "nuevaVersion" &&
          selectedVersionSourceDoc
            ? selectedVersionSourceDoc.numeroDocumento
            : null;
        const plannedVersion =
          task.esVersionable &&
          versionableDocMode === "nuevaVersion" &&
          selectedVersionSourceDoc
            ? selectedVersionSourceDoc.versionDocumento + 1
            : null;

        const fingerprint = buildCreateTaskFingerprint({
          idProyecto,
          title,
          carpeta: carpetaSeleccionada,
          idTipo,
          esVersionable: !!task.esVersionable,
          versionableDocMode,
          numeroDocumento: plannedNumero,
          versionDocumento: plannedVersion,
          elaborador: String(task.elaborador || ""),
          responsable: String(task.responsable || ""),
        });

        const session = createTaskSessionRef.current;
        if (session && session.fingerprint === fingerprint && session.idTarea > 0) {
          if (session.spItemId > 0) {
            idTarea = session.idTarea;
            spItemId = session.spItemId;
            resumeCreate = true;
          } else {
            // Alta previa reservó IDTarea pero no confirmó SP Id: buscar por IDTarea.
            try {
              const byIdTarea: any[] = await list.items
                .filter(`IDTarea eq ${session.idTarea}`)
                .select("ID", "IDTarea")
                .top(1)
                .get();
              if (byIdTarea[0]?.ID) {
                idTarea = Number(byIdTarea[0].IDTarea);
                spItemId = Number(byIdTarea[0].ID);
                resumeCreate = true;
                createTaskSessionRef.current = {
                  fingerprint,
                  idTarea,
                  spItemId,
                  plantillaSaved: session.plantillaSaved,
                };
              } else {
                // Reutilizar el mismo IDTarea reservado (evitar otro max+1).
                idTarea = session.idTarea;
                spItemId = null;
              }
            } catch {
              idTarea = session.idTarea;
              spItemId = null;
            }
          }
        } else {
          const filterParts = [
            `IDProyecto eq ${idProyecto}`,
            `Title eq '${escapeODataSingleQuoted(title)}'`,
            `Carpeta eq '${escapeODataSingleQuoted(carpetaSeleccionada)}'`,
            `EstadoTarea eq 'AltaTareaDoc'`,
          ];
          if (idTipo !== null && idTipo !== undefined) {
            filterParts.push(`IDTipo eq ${idTipo}`);
          }
          if (
            plannedNumero !== null &&
            plannedNumero !== undefined &&
            !Number.isNaN(Number(plannedNumero))
          ) {
            filterParts.push(`NumeroDocumento eq ${Number(plannedNumero)}`);
          }
          if (
            plannedVersion !== null &&
            plannedVersion !== undefined &&
            !Number.isNaN(Number(plannedVersion))
          ) {
            filterParts.push(`VersionDocumento eq ${Number(plannedVersion)}`);
          }

          try {
            const candidates: any[] = await list.items
              .filter(filterParts.join(" and "))
              .select(
                "ID",
                "IDTarea",
                "NumeroDocumento",
                "VersionDocumento",
                "Responsable",
                "Elaborador",
              )
              .orderBy("ID", false)
              .top(5)
              .get();

            const match = candidates.find((c) => {
              const respOk =
                normalizeText(String(c?.Responsable || "")) ===
                normalizeText(String(task.responsable || ""));
              const elabOk =
                normalizeText(String(c?.Elaborador || "")) ===
                normalizeText(String(task.elaborador || ""));
              return respOk && elabOk;
            });

            if (match?.ID && match?.IDTarea) {
              idTarea = Number(match.IDTarea);
              spItemId = Number(match.ID);
              resumeCreate = true;
              createTaskSessionRef.current = {
                fingerprint,
                idTarea,
                spItemId,
                plantillaSaved: session?.plantillaSaved,
              };
            }
          } catch (lookupErr) {
            console.warn(
              "No se pudo buscar tarea existente para reintento idempotente:",
              lookupErr,
            );
          }

          if (!resumeCreate) {
            const existingItems: any[] = await list.items
              .select("IDTarea")
              .top(5000)
              .getAll();
            const maxId = existingItems.reduce(
              (acc, item) =>
                item.IDTarea !== null &&
                item.IDTarea !== undefined &&
                Number(item.IDTarea) > acc
                  ? Number(item.IDTarea)
                  : acc,
              0,
            );
            idTarea = maxId + 1;
            createTaskSessionRef.current = {
              fingerprint,
              idTarea,
              spItemId: 0,
              plantillaSaved: false,
            };
          }
        }
      }

      if (
        !isEdit &&
        !task.esVersionable &&
        carpetaSeleccionada &&
        idTipo !== null &&
        idTipo !== undefined
      ) {
        const existingSameTask: any[] = await list.items
          .filter(
            `Carpeta eq '${escapeODataSingleQuoted(carpetaSeleccionada)}' and IDTipo eq ${idTipo}`,
          )
          .select("ID")
          .top(1)
          .get();

        // Validación de unicidad carpeta+tipo comentada a propósito (legado).
        void existingSameTask;
      }

      const toDateTime = (value: string | undefined): string | null => {
        if (!value) return null;
        const parts = value.split("/");
        if (parts.length !== 3) return null;
        const [day, month, year] = parts;
        if (!day || !month || !year) return null;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(
          2,
          "0",
        )}T00:00:00Z`;
      };

      const itemData: Record<string, unknown> = {
        Title: title,
        IDTarea: idTarea,
        IDProyecto: idProyecto,
        FechaInicioTarea: toDateTime(task.fechaInicio),
        FechaFinTarea: toDateTime(task.fechaFin),
        EstadoTarea: task.estado ?? "",
        Responsable: task.responsable ?? "",
        DescripcionTarea: task.descripcion ?? "",
        EsEntregable: !!task.entregable,
        TieneDeadline: !!task.tieneDeadline,
        FechaDeadline: toDateTime(task.fechaDeadline),
        RequiereAprobacion: !!task.requiereAprobacion,
        RequiereFirma: !!task.requiereFirma,
        ConvertirAPDF: !!task.requiereFirma ? false : !!task.convertirAPDF,
        Estado: task.estado ?? "",
        Elaborador: task.elaborador ?? "",
        ListaAprobadores: aprobadoresSeleccionados.join(";"),
        ListaFirmantes: firmantesSeleccionados.join(";"),
        IDPlantillaTareaDocumental:
          !Number.isNaN(plantillaTareaIdNum) && plantillaTareaIdNum > 0
            ? plantillaTareaIdNum
            : null,
      };
      if (!isEdit) {
        itemData.Carpeta = carpetaSeleccionada;
        itemData.EsVersionable = !!task.esVersionable;
        if (idTipo !== null && idTipo !== undefined) itemData.IDTipo = idTipo;
        if (
          patronNomenclatura &&
          patronNomenclatura !== null &&
          patronNomenclatura !== undefined
        ) {
          itemData.PatronNomenclatura = patronNomenclatura;
        }

        const acronimoTipo = String(tipoSeleccionado?.Acronimo || "").trim();
        if (acronimoTipo) {
          itemData.Acronimo = acronimoTipo;
        }

        if (resumeCreate && spItemId) {
          // Conservar numeración ya asignada en el alta parcial.
          try {
            const existingNums: any = await list.items
              .getById(spItemId)
              .select("NumeroDocumento", "VersionDocumento")
              .get();
            const n = Number(existingNums?.NumeroDocumento);
            const v = Number(existingNums?.VersionDocumento);
            if (Number.isFinite(n) && n > 0) itemData.NumeroDocumento = n;
            if (Number.isFinite(v) && v > 0) itemData.VersionDocumento = v;
          } catch {
            // Si no se pueden leer, se recalculan abajo.
          }
        }

        if (
          itemData.NumeroDocumento === undefined ||
          itemData.VersionDocumento === undefined
        ) {
          if (!task.esVersionable) {
            itemData.VersionDocumento = itemData.VersionDocumento ?? 1;
            if (itemData.NumeroDocumento === undefined) {
              itemData.NumeroDocumento =
                await resolveNextNumeroDocumentoForAcronimo(
                  idProyecto,
                  acronimoTipo,
                );
            }
          } else if (versionableDocMode === "nuevo") {
            itemData.VersionDocumento = itemData.VersionDocumento ?? 1;
            if (itemData.NumeroDocumento === undefined) {
              itemData.NumeroDocumento =
                await resolveNextNumeroDocumentoForAcronimo(
                  idProyecto,
                  acronimoTipo,
                );
            }
          } else if (
            versionableDocMode === "nuevaVersion" &&
            selectedVersionSourceDoc
          ) {
            itemData.NumeroDocumento =
              itemData.NumeroDocumento ??
              selectedVersionSourceDoc.numeroDocumento;
            itemData.VersionDocumento =
              itemData.VersionDocumento ??
              selectedVersionSourceDoc.versionDocumento + 1;
          }
        }

        // Denormalizar CodExp / Nemotecnico desde el expediente de la tarea.
        try {
          const expLookup: any[] = await sp.web.lists
            .getByTitle("Expedientes")
            .items.filter(`IDExpediente eq ${idProyecto}`)
            .select("CodExp", "Nemotecnico")
            .top(1)
            .get();
          if (expLookup.length) {
            const nemotecnico = String(expLookup[0].Nemotecnico || "").trim();
            const codExp = String(expLookup[0].CodExp || "").trim();
            if (nemotecnico) itemData.Nemotecnico = nemotecnico;
            if (codExp) itemData.CodExp = codExp;
          }
        } catch (expLookupErr) {
          console.warn(
            "No se pudo obtener CodExp/Nemotecnico del expediente:",
            expLookupErr,
          );
        }
      }

      if (isEdit && spItemId !== null) {
        await list.items.getById(spItemId).update(itemData);
      } else if (resumeCreate && spItemId !== null) {
        await list.items.getById(spItemId).update(itemData);
      } else {
        const addResult: any = await list.items.add(itemData);
        const newSpId = Number(
          addResult?.data?.Id ?? addResult?.data?.ID ?? addResult?.Id ?? 0,
        );
        if (Number.isFinite(newSpId) && newSpId > 0) {
          spItemId = newSpId;
          if (createTaskSessionRef.current) {
            createTaskSessionRef.current = {
              ...createTaskSessionRef.current,
              idTarea,
              spItemId: newSpId,
            };
          }
        }
      }

      if (isEdit && selectedTaskDocumentUrl && tareaSelected) {
        const tareaNum = parseInt(tareaSelected, 10);
        if (!isNaN(tareaNum)) {
          const docList = sp.web.lists.getByTitle("DocumentoPrincipal");
          const docs: any[] = await docList.items
            .filter(`IDTarea eq ${tareaNum}`)
            .select("ID", "IDDocumento")
            .top(5000)
            .getAll();

          const previousAssignedUrlRaw = String(
            assignedTaskDocumentUrl || "",
          ).trim();
          const selectedAssignedUrlRaw = String(
            selectedTaskDocumentUrl || "",
          ).trim();
          const previousAssignedUrl = resolveServerRelativeDocumentUrl(
            previousAssignedUrlRaw,
            webServerRelativeUrl,
          );
          const selectedAssignedUrl = resolveServerRelativeDocumentUrl(
            selectedAssignedUrlRaw,
            webServerRelativeUrl,
          );
          const hasDocumentChanged =
            !!selectedAssignedUrl && selectedAssignedUrl !== previousAssignedUrl;

          if (!selectedAssignedUrl) {
            throw new Error(
              "La URL del documento asociado no es válida para SharePoint (serverRelativeUrl).",
            );
          }

          for (const d of docs) {
            if (!d?.ID) continue;
            await docList.items
              .getById(d.ID as number)
              .update({ UrlDocumento: selectedAssignedUrl });
          }

          if (hasDocumentChanged) {
            const metadataFieldsToReset: Record<string, unknown> = {
              TituloDocumento: null,
              NombreDocumento: null,
              TipologiaDocumental: null,
              NumeroDocumento: null,
              VersionDocumento: null,
              OrdinalE2E: null,
              IDDocumento: null,
              IDExpedienteDocumento: null,
              IDTipo: null,
            };

            if (previousAssignedUrl) {
              try {
                const previousFileItem = await sp.web
                  .getFileByServerRelativeUrl(previousAssignedUrl)
                  .getItem();
                await previousFileItem.update(metadataFieldsToReset);
              } catch (clearErr) {
                console.error(
                  "Error limpiando metadatos del documento anterior:",
                  clearErr,
                );
              }
            }

          }

          const primeraDocPrincipal = docs[0];
          const idDocumento = Number(primeraDocPrincipal?.IDDocumento);
          if (isFinite(idDocumento) && idDocumento > 0) {
            const metasItems: any[] = await sp.web.lists
              .getByTitle("MetadatosDocumentos")
              .items.filter(`IDDocumento eq ${idDocumento}`)
              .select("Title", "ValorMetadato")
              .top(5000)
              .get();

            const normalizeMetaTitle = (value: unknown): string =>
              String(value || "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            const metaValueByKey = new Map<string, string>();
            metasItems.forEach((m) => {
              const keyNorm = normalizeMetaTitle(m.Title);
              const val = String(m.ValorMetadato || "").trim();
              if (!keyNorm || !val) return;
              metaValueByKey.set(keyNorm, val);
            });

            // Valores actuales del formulario (metadatos del tipo seleccionado).
            const currentDocMetas = documents[0]?.metadatos || {};
            const formMetaByTitleNorm = new Map<string, string>();
            metadatosTipo.forEach((metaDef) => {
              const metaNorm = normalizeMetaTitle(metaDef.Title);
              if (!metaNorm) return;
              const raw = currentDocMetas[metaDef.IdTipoMetadato];
              const val = String(raw ?? "").trim();
              if (val) formMetaByTitleNorm.set(metaNorm, val);
            });

            const metadataToSet: Record<string, unknown> = {};

            const tituloForm =
              formMetaByTitleNorm.get("titulo") ||
              formMetaByTitleNorm.get("titulodocumento");
            const titulo =
              tituloForm ||
              metaValueByKey.get("titulo") ||
              metaValueByKey.get("titulodocumento");
            if (titulo) metadataToSet.TituloDocumento = titulo;

            const nombreForm =
              formMetaByTitleNorm.get("nombre") ||
              formMetaByTitleNorm.get("nombredocumento");
            const nombre =
              nombreForm ||
              metaValueByKey.get("nombre") ||
              metaValueByKey.get("nombredocumento");
            if (nombre) metadataToSet.NombreDocumento = nombre;

            // TipologiaDocumental debe seguir el tipo de documento seleccionado
            // actualmente en el formulario.
            if (idTipo !== null && idTipo !== undefined) {
              metadataToSet.TipologiaDocumental = String(idTipo);
            } else {
              const tipologia =
                metaValueByKey.get("tipologiadocumental") ||
                metaValueByKey.get("tipologia") ||
                metaValueByKey.get("tipologias");
              if (tipologia) metadataToSet.TipologiaDocumental = tipologia;
            }

            const numero =
              metaValueByKey.get("numerodocumento") || metaValueByKey.get("numero");
            if (numero) metadataToSet.NumeroDocumento = parseInt(numero, 10);

            const version =
              metaValueByKey.get("versiondocumento") ||
              metaValueByKey.get("version");
            if (version) metadataToSet.VersionDocumento = parseInt(version, 10);

            // OrdinalE2E debe seguir el expediente de la tarea en edición.
            try {
              const expItems: any[] = await sp.web.lists
                .getByTitle("Expedientes")
                .items.filter(`IDExpediente eq ${idProyecto}`)
                .select("OrdinalE2E")
                .top(1)
                .get();
              const ordinalFromExp = Number(expItems[0]?.OrdinalE2E);
              if (!isNaN(ordinalFromExp)) {
                metadataToSet.OrdinalE2E = ordinalFromExp;
              } else {
                const ordinal =
                  metaValueByKey.get("ordinalede2e") ||
                  metaValueByKey.get("ordinal") ||
                  metaValueByKey.get("ordinale2e");
                if (ordinal) metadataToSet.OrdinalE2E = parseInt(ordinal, 10);
              }
            } catch {
              const ordinal =
                metaValueByKey.get("ordinalede2e") ||
                metaValueByKey.get("ordinal") ||
                metaValueByKey.get("ordinale2e");
              if (ordinal) metadataToSet.OrdinalE2E = parseInt(ordinal, 10);
            }

            // Siempre guardar el IDTipo actual de la tarea en el documento seleccionado.
            if (idTipo !== null && idTipo !== undefined) {
              metadataToSet.IDTipo = idTipo;
            }
            metadataToSet.IDDocumento = idDocumento;
            if (idProyecto !== null && idProyecto !== undefined) {
              metadataToSet.IDExpedienteDocumento = idProyecto;
            }

            const selectedFileItem = await sp.web
              .getFileByServerRelativeUrl(selectedAssignedUrl)
              .getItem();
            await selectedFileItem.update(metadataToSet);
          }

          setAssignedTaskDocumentUrl(selectedAssignedUrl);
          setSelectedTaskDocumentUrl(selectedAssignedUrl);
          setAssignDocumentError("");
        }
      }

      // Sincronizar revisiones desde la lista de aprobadores
      if (task.requiereAprobacion) {
        const revisionesList = sp.web.lists.getByTitle("Revisiones");

        // En edición eliminamos y recreamos para mantener la lista de revisores coherente
        const revisionesExistentes: any[] = await revisionesList.items
          .filter(`IDTareaDocumental eq ${idTarea}`)
          .select("ID")
          .top(5000)
          .getAll();
        for (const rev of revisionesExistentes) {
          await revisionesList.items.getById(rev.ID as number).delete();
        }

        const aprobadores = (task.aprobadores || [])
          .map((a) => String(a || "").trim())
          .filter(Boolean);

        if (aprobadores.length > 0) {
          // Obtenemos el correo desde Roles_usuario.usuario para el expediente de la tarea
          const rolesRaw: any[] = await sp.web.lists
            .getByTitle("Roles_usuario")
            .items.filter(`IDExpediente eq ${idProyecto}`)
            .select("Title", "usuario")
            .top(5000)
            .getAll();

          const normalize = (value: unknown): string =>
            String(value || "")
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");

          const tryGetEmail = (role: any): string => {
            const userField = role?.usuario;
            if (!userField) return "";
            // Fallback cuando viene serializado en texto/objeto plano
            if (typeof userField === "string") {
              const str = userField.trim();
              if (str.includes("@")) return str;
            }
          };

          const emailByNombre = new Map<string, string>();
          rolesRaw.forEach((r) => {
            const nombre = normalize(r?.Title);
            if (!nombre || emailByNombre.has(nombre)) return;
            const correo = tryGetEmail(r);
            if (correo) emailByNombre.set(nombre, correo);
          });

          for (let i = 0; i < aprobadores.length; i++) {
            const nombreRevisor = aprobadores[i];
            const correoRevisor =
              emailByNombre.get(normalize(nombreRevisor)) || "";

            const revisionItem: Record<string, unknown> = {
              Title: nombreRevisor,
              IDTareaDocumental: idTarea,
              Orden: i + 1,
              EstadoRevision: "Pendiente",
              IDRevisor: correoRevisor,
            };
            await revisionesList.items.add(revisionItem);
          }
        }
      }

      // Sincronizar firmas desde la lista de firmantes
      if (task.requiereFirma) {
        const firmasList = sp.web.lists.getByTitle("Firmas");

        // En edición eliminamos y recreamos para mantener datos coherentes
        const firmasExistentes: any[] = await firmasList.items
          .filter(`IDTareaDocumental eq ${idTarea}`)
          .select("ID")
          .top(5000)
          .getAll();
        for (const firma of firmasExistentes) {
          await firmasList.items.getById(firma.ID as number).delete();
        }

        const firmantes = (task.firmantes || [])
          .map((f) => String(f || "").trim())
          .filter(Boolean);

        if (firmantes.length > 0) {
          const rolesRaw: any[] = await sp.web.lists
            .getByTitle("Roles_usuario")
            .items.filter(`IDExpediente eq ${idProyecto}`)
            .select("Title", "usuario")
            .top(5000)
            .getAll();

          const normalize = (value: unknown): string =>
            String(value || "")
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");

          const tryGetEmail = (role: any): string => {
            const userField = role?.usuario;
            if (!userField) return "";

            if (typeof userField === "string") {
              const str = userField.trim();
              if (str.includes("@")) return str;
            }
          };

          const emailByNombre = new Map<string, string>();
          rolesRaw.forEach((r) => {
            const nombre = normalize(r?.Title);
            if (!nombre || emailByNombre.has(nombre)) return;
            const correo = tryGetEmail(r);
            if (correo) emailByNombre.set(nombre, correo);
          });

          for (const nombreFirmante of firmantes) {
            const correoFirmante =
              emailByNombre.get(normalize(nombreFirmante)) || "";

            const firmaItem: Record<string, unknown> = {
              Title: nombreFirmante,
              IDTareaDocumental: idTarea,
              IDFirmante: correoFirmante,
              EstadoFirma: "Pendiente",
            };
            await firmasList.items.add(firmaItem);
          }
        }
      }

      // Guardar documentos en DocumentoPrincipal y sus metadatos en MetadatosDocumentos
      // Solo en alta. En edición no debemos tocar DocumentoPrincipal para no
      // sobrescribir campos ya rellenados (por ejemplo UrlDocumento).
      const docList = sp.web.lists.getByTitle("DocumentoPrincipal");
      const metaDocList = sp.web.lists.getByTitle("MetadatosDocumentos");

      // Obtener Ordinal del expediente asociado (para metadato OrdinalE2E)
      let ordinalE2E: number | null = null;
      try {
        const expItems: any[] = await sp.web.lists
          .getByTitle("Expedientes")
          .items.filter(`IDExpediente eq ${idProyecto}`)
          .select("OrdinalE2E")
          .top(1)
          .get();
        if (expItems.length) {
          const ord = expItems[0].OrdinalE2E;
          if (ord !== null && ord !== undefined && !isNaN(Number(ord))) {
            ordinalE2E = Number(ord);
          }
        }
      } catch {
        ordinalE2E = null;
      }

      if (isEdit) {
        // En edición mantenemos DocumentoPrincipal (incluido UrlDocumento)
        // y solo refrescamos metadatos asociados a cada IDDocumento.
        const existingDocsForTask: any[] = await docList.items
          .filter(`IDTarea eq ${idTarea}`)
          .select("IDDocumento")
          .top(5000)
          .getAll();

        for (let i = 0; i < existingDocsForTask.length; i++) {
          const existingDoc = existingDocsForTask[i];
          const currentIdDocumento = Number(existingDoc?.IDDocumento);
          if (!currentIdDocumento || isNaN(currentIdDocumento)) continue;

          const existingMetas: any[] = await metaDocList.items
            .filter(`IDDocumento eq ${currentIdDocumento}`)
            .select("ID")
            .top(5000)
            .getAll();
          for (const meta of existingMetas) {
            await metaDocList.items.getById(meta.ID).delete();
          }

          const sourceDoc = documents[i] || documents[0] || { metadatos: {} };
          const metasForDoc = sourceDoc.metadatos || {};
          for (const metaDef of metadatosTipo) {
            const valor =
              metasForDoc[metaDef.IdTipoMetadato] ?? metaDef.ValorMetadato ?? "";
            if (!valor) continue;
            await metaDocList.items.add({
              Title: metaDef.Title,
              IDDocumento: currentIdDocumento,
              ValorMetadato: valor,
            });
          }

          if (ordinalE2E !== null) {
            await metaDocList.items.add({
              Title: "OrdinalE2E",
              IDDocumento: currentIdDocumento,
              ValorMetadato: String(ordinalE2E),
            });
          }
        }
      } else {
        const existingDocsForTask: any[] = await docList.items
          .filter(`IDTarea eq ${idTarea}`)
          .select("ID", "IDDocumento")
          .top(5000)
          .getAll();

        if (existingDocsForTask.length > 0) {
          // Alta reanudada: DocumentoPrincipal ya existe → no crear duplicados.
        } else {
          const existingDocs: any[] = await docList.items
            .select("IDDocumento")
            .top(5000)
            .getAll();
          const maxDocId = existingDocs.reduce(
            (acc, item) =>
              item.IDDocumento !== null &&
              item.IDDocumento !== undefined &&
              Number(item.IDDocumento) > acc
                ? Number(item.IDDocumento)
                : acc,
            0,
          );
          let nextDocId = maxDocId + 1;

          for (const doc of documents) {
            const idDocumento = nextDocId++;

            const docData: Record<string, unknown> = {
              IDDocumento: idDocumento,
              IDTarea: idTarea,
            };
            await docList.items.add(docData);

            const metasForDoc = doc.metadatos || {};
            for (const metaDef of metadatosTipo) {
              const valor =
                metasForDoc[metaDef.IdTipoMetadato] ??
                metaDef.ValorMetadato ??
                "";
              if (!valor) {
                continue;
              }

              const metaItem: Record<string, unknown> = {
                Title: metaDef.Title,
                IDDocumento: idDocumento,
                ValorMetadato: valor,
              };

              await metaDocList.items.add(metaItem);
            }

            if (ordinalE2E !== null) {
              const metaOrdian: Record<string, unknown> = {
                Title: "OrdinalE2E",
                IDDocumento: idDocumento,
                ValorMetadato: String(ordinalE2E),
              };
              await metaDocList.items.add(metaOrdian);
            }
          }
        }
      }

      if (
        !isEdit &&
        guardarPlantilla &&
        !createTaskSessionRef.current?.plantillaSaved
      ) {
        const plantillaList = sp.web.lists.getByTitle(
          "PlantillasTareasDocumentales",
        );
        const existingPlantillas: any[] = await plantillaList.items
          .select("IDPlantillaTareaDocumental")
          .top(5000)
          .getAll();
        const maxIdPlantilla = existingPlantillas.reduce((acc, item) => {
          const current = Number(item?.IDPlantillaTareaDocumental);
          return !isNaN(current) && current > acc ? current : acc;
        }, 0);

        await plantillaList.items.add({
          Title: String(nombrePlantilla || "").trim(),
          IDPlantillaTareaDocumental: maxIdPlantilla + 1,
          TituloTarea: task.nombre || "",
          DescripcionTarea: task.descripcion || "",
          EsEntregable: !!task.entregable,
          TieneDeadline: !!task.tieneDeadline,
          RequiereAprobacion: !!task.requiereAprobacion,
          RequiereFirma: !!task.requiereFirma,
        });

        if (createTaskSessionRef.current) {
          createTaskSessionRef.current = {
            ...createTaskSessionRef.current,
            plantillaSaved: true,
          };
        }

        setGuardarPlantilla(false);
        setNombrePlantilla("");
        await loadPlantillasTarea();
      }

      // Mostrar mensaje de éxito y, tras una breve espera, redirigir.
      setError("");
      console.log("Tarea y documentos guardados correctamente.");
      setSuccessMessage(
        isEdit
          ? "La tarea se ha actualizado correctamente. Redirigiendo al detalle de la tarea..."
          : resumeCreate
            ? "La tarea se ha completado correctamente (alta reanudada). Redirigiendo al detalle de la tarea..."
            : "La tarea se ha creado correctamente. Redirigiendo al detalle de la tarea...",
      );
      // Bloquear Guardar hasta el redirect: evita un segundo click que
      // reescribe la tarea y puede impedir el disparo del flujo de Power Automate.
      saveFinishedRedirectingRef.current = true;
      setSaveFinishedRedirecting(true);
      if (!isEdit) {
        // Alta finalizada: limpiar huella de sesión para no reutilizar en un alta nueva.
        createTaskSessionRef.current = null;
      }
      setTimeout(() => {
        window.location.href = `${absolutePath}/SitePages/detalle-tarea.aspx?tareaid=${idTarea}`;
      }, 2000);
    } catch (err: any) {
      const msg =
        err?.message || err?.toString?.() || "Error al guardar la tarea.";
      setError(msg);
      console.error("Error guardando en TareasDocumentales:", err);
    } finally {
      // Si el guardado terminó OK, mantener el botón deshabilitado hasta redirigir.
      if (!saveFinishedRedirectingRef.current) {
        isSavingTaskRef.current = false;
        setIsSavingTask(false);
      }
    }
  };

  // const handleNewDocument = () => {
  //   setDocuments(prev => [
  //     ...prev,
  //     {
  //       nombre: "",
  //       descripcion: "",
  //       metadato1: "",
  //       metadato2: "",
  //       metadato3: "",
  //       metadato4: ""
  //     }
  //   ]);
  // };

  const handlePeoplePickerChange = React.useCallback((items: any[]) => {
    const nombres = items?.map((i) => i.text as string).filter(Boolean) || [];
    setError("");
    handleChange("elaborador" as any, nombres.join(", "));
    setElaboradorPreselected(
      nombres.map((name) => ({ key: name, text: name })),
    );
  }, [handleChange]);

  // const handleDocChange = (index: number, field: string, value: string) => {
  //   const updatedDocs = [...documents];
  //   updatedDocs[index] = {
  //     ...updatedDocs[index],
  //     [field]: value,
  //   };
  //   setDocuments(updatedDocs);
  // };

  const handleDocMetadataChange = (
    index: number,
    metaId: number,
    value: string,
  ) => {
    const updatedDocs = [...documents];
    const current = updatedDocs[index];
    const currentMetas = { ...(current.metadatos || {}) };
    currentMetas[metaId] = value;
    updatedDocs[index] = {
      ...current,
      metadatos: currentMetas,
    };
    setDocuments(updatedDocs);
  };

  const handleBackFolderNavigation = (): void => {
    if (!rootFolderUrl) return;
    if (folderBreadcrumb.length === 0) {
      void loadFolderLevel(rootFolderUrl, rootFolderUrl);
      return;
    }
    const nextSegments = folderBreadcrumb.slice(0, -1);
    const targetUrl =
      nextSegments.length > 0
        ? `${rootFolderUrl}/${nextSegments.join("/")}`
        : rootFolderUrl;
    void loadFolderLevel(targetUrl, rootFolderUrl);
  };

  const handlePlantillaChange = (plantillaIdValue: string): void => {
    setSelectedPlantillaId(plantillaIdValue);
    if (!plantillaIdValue) {
      setTask((prev) => ({
        ...prev,
        nombre: "",
        descripcion: "",
        entregable: false,
        tieneDeadline: false,
        requiereAprobacion: false,
        requiereFirma: false,
        convertirAPDF: false,
        fechaDeadline: "",
        aprobadores: [],
        firmantes: [],
      }));
      setAprobadoresPreselected([]);
      setFirmantesPreselected([]);
      return;
    }
    const plantilla = plantillasTarea.find(
      (p) =>
        String(p.idPlantilla) === plantillaIdValue ||
        String(p.id) === plantillaIdValue,
    );
    if (!plantilla) return;

    setTask((prev) => ({
      ...prev,
      nombre: plantilla.tituloTarea || prev.nombre,
      descripcion: plantilla.descripcionTarea || "",
      entregable: plantilla.esEntregable,
      tieneDeadline: plantilla.tieneDeadline,
      requiereAprobacion: plantilla.requiereAprobacion,
      requiereFirma: plantilla.requiereFirma,
      convertirAPDF: plantilla.requiereFirma ? false : prev.convertirAPDF,
      fechaDeadline: plantilla.tieneDeadline ? prev.fechaDeadline : "",
      aprobadores: plantilla.requiereAprobacion ? prev.aprobadores : [],
      firmantes: plantilla.requiereFirma ? prev.firmantes : [],
    }));

    if (!plantilla.requiereAprobacion) {
      setAprobadoresPreselected([]);
    }
    if (!plantilla.requiereFirma) {
      setFirmantesPreselected([]);
    }
  };

  const renderDocs = () => {
    return documents.map((doc, index) => (
      <div key={index} className={styles.docBlock}>
        <h4>Metadatos del documento</h4>

        <div className={styles.grid}>
          {metadatosTipo
            .filter((meta) => {
              const titleNorm = (meta.Title || "").trim().toLowerCase();
              return (
                titleNorm === "titulo" ||
                titleNorm === "título" ||
                titleNorm === "nombre"
              );
            })
            .map((meta) => (
              <div
                className={styles.containerDocItem}
                key={meta.IdTipoMetadato}
              >
                <label>{meta.Title}</label>
                <input
                  value={doc.metadatos?.[meta.IdTipoMetadato] ?? ""}
                  onChange={(e) =>
                    handleDocMetadataChange(
                      index,
                      meta.IdTipoMetadato,
                      e.target.value,
                    )
                  }
                />
              </div>
            ))}
        </div>
        {/* )} */}
      </div>
    ));
  };

  React.useEffect(() => {
    if (projectSelected) {
      void getData(projectSelected);
    }
    void loadPlantillasTarea();
  }, [projectSelected]);

  const currentUserNorm = normalizeText(currentUserName);
  const currentUserEmailNorm = normalizeText(context.pageContext.user.email || "");
  const elaboradoresTask = String(task.elaborador || "")
    .split(",")
    .map((name) => normalizeText(name))
    .filter(Boolean);
  const isCurrentUserTaskElaborador =
    !!tareaSelected &&
    (elaboradoresTask.includes(currentUserNorm) ||
      (!!currentUserEmailNorm && elaboradoresTask.includes(currentUserEmailNorm)));
  const canEditAssignedDocument =
    !!tareaSelected &&
    !!task.proyectoId &&
    !!assignedTaskDocumentUrl &&
    isCurrentUserTaskElaborador;
  const isEditMode = !!tareaSelected;

  const selectedTipoDocumento = React.useMemo(() => {
    if (!task.tipoDocumento) return undefined;
    return (
      tiposDocumentoFiltrados.find((t) => t.Title === task.tipoDocumento) ||
      tiposDocumento.find((t) => t.Title === task.tipoDocumento)
    );
  }, [task.tipoDocumento, tiposDocumentoFiltrados, tiposDocumento]);

  const carpetaDestinoReady =
    carpetaDestinoExists === true && !!selectedFolderUrl;

  const showVersionableDocModeQuestion =
    !!task.tipoDocumento &&
    !!task.esVersionable &&
    !isEditMode &&
    carpetaDestinoReady &&
    selectedTipoDocumento?.IDTipoDocumento != null;

  const showDestinationDocsReadOnly =
    !!task.tipoDocumento &&
    carpetaDestinoReady &&
    selectedTipoDocumento?.IDTipoDocumento != null &&
    (!task.esVersionable ||
      (task.esVersionable && versionableDocMode === "nuevo"));

  const showVersionSourceDocPicker =
    !!task.esVersionable &&
    versionableDocMode === "nuevaVersion" &&
    carpetaDestinoReady &&
    selectedTipoDocumento?.IDTipoDocumento != null;

  const showTareasPendientesPorTipo =
    !!task.tipoDocumento &&
    !!proyectoIdActivo &&
    selectedTipoDocumento?.IDTipoDocumento != null &&
    (!task.esVersionable ||
      (task.esVersionable &&
        (versionableDocMode === "nuevo" ||
          versionableDocMode === "nuevaVersion")));

  const versionableDocModeValidationError = React.useMemo((): string => {
    if (!showVersionableDocModeQuestion) return "";

    if (!versionableDocMode) {
      return "Debe indicar si el documento es nuevo o una nueva versión de un documento existente.";
    }

    if (versionableDocMode === "nuevaVersion") {
      if (versionSourceDocError) return versionSourceDocError;
      if (!selectedVersionSourceDoc) {
        return "Debe seleccionar un documento base para crear la nueva versión.";
      }
    }

    return "";
  }, [
    showVersionableDocModeQuestion,
    versionableDocMode,
    versionSourceDocError,
    selectedVersionSourceDoc,
  ]);

  React.useEffect(() => {
    const idProyecto = parseSharePointNumber(proyectoIdActivo);
    const idTipo = selectedTipoDocumento?.IDTipoDocumento ?? null;

    if (!task.tipoDocumento || idProyecto === null || idTipo === null) {
      setTareasPendientesTipo([]);
      setTareasPendientesTipoError("");
      setLoadingTareasPendientesTipo(false);
      return;
    }

    const shouldLoadPendingTasks =
      !task.esVersionable ||
      versionableDocMode === "nuevo" ||
      versionableDocMode === "nuevaVersion";

    if (!shouldLoadPendingTasks) {
      setTareasPendientesTipo([]);
      setTareasPendientesTipoError("");
      setLoadingTareasPendientesTipo(false);
      return;
    }

    let cancelled = false;

    const loadTareasPendientesPorTipo = async (): Promise<void> => {
      setLoadingTareasPendientesTipo(true);
      setTareasPendientesTipoError("");
      try {
        let filter = `IDProyecto eq ${idProyecto} and IDTipo eq ${idTipo} and EstadoTarea ne 'Fin'`;
        if (tareaSelected) {
          const tareaNum = parseInt(tareaSelected, 10);
          if (!isNaN(tareaNum)) {
            filter += ` and IDTarea ne ${tareaNum}`;
          }
        }

        const items: any[] = await sp.web.lists
          .getByTitle("TareasDocumentales")
          .items.filter(filter)
          .select(
            "IDTarea",
            "Title",
            "EstadoTarea",
            "Responsable",
            "Elaborador",
            "NumeroDocumento",
            "VersionDocumento",
            "IDTipo",
          )
          .top(5000)
          .getAll();

        if (cancelled) return;

        setTareasPendientesTipo(
          items.map((item) => ({
            idTarea: Number(item.IDTarea) || 0,
            title: String(item.Title || "").trim(),
            estado: String(item.EstadoTarea || "").trim(),
            responsable: String(item.Responsable || "").trim(),
            elaborador: String(item.Elaborador || "").trim(),
            numeroDocumento: parseSharePointNumber(item.NumeroDocumento),
            versionDocumento: parseSharePointNumber(item.VersionDocumento),
          })),
        );
      } catch (err) {
        console.error("Error cargando tareas pendientes por tipo:", err);
        if (!cancelled) {
          setTareasPendientesTipo([]);
          setTareasPendientesTipoError(
            "No se han podido cargar las tareas no finalizadas para este tipo documental.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTareasPendientesTipo(false);
        }
      }
    };

    void loadTareasPendientesPorTipo();

    return () => {
      cancelled = true;
    };
  }, [
    task.tipoDocumento,
    selectedTipoDocumento?.IDTipoDocumento,
    proyectoIdActivo,
    tareaSelected,
    task.esVersionable,
    versionableDocMode,
  ]);

  React.useEffect(() => {
    if (
      !selectedVersionSourceDoc ||
      versionableDocMode !== "nuevaVersion" ||
      tareasPendientesTipo.length === 0
    ) {
      return;
    }
    const conflictMessage = getVersionSourceConflictMessage(
      selectedVersionSourceDoc.numeroDocumento,
      tareasPendientesTipo,
    );
    if (conflictMessage) {
      setSelectedVersionSourceDoc(null);
      setVersionSourceDocError(conflictMessage);
    }
  }, [tareasPendientesTipo, selectedVersionSourceDoc, versionableDocMode]);

  // Campos Fluent (PeoplePicker / DatePicker) memoizados: evitan repintados
  // (parpadeo) cuando se re-renderiza por cambios de estado no relacionados,
  // como marcar los checkboxes de la sección.
  const fechaInicioField = React.useMemo(
    () => (
      <div>
        <label>Fecha Inicio</label>
        <DatePicker
          firstDayOfWeek={DayOfWeek.Monday}
          value={parseDisplayToDate(task.fechaInicio)}
          formatDate={formatDateDisplay}
          onSelectDate={(date) =>
            handleChange("fechaInicio", date ? formatDateDisplay(date) : "")
          }
        />
      </div>
    ),
    [task.fechaInicio, handleChange],
  );

  const fechaFinField = React.useMemo(
    () => {
      const fechaFinDate = parseDisplayToDate(task.fechaFin);
      return (
        <div>
          <label>Fecha Fin</label>
          <DatePicker
            firstDayOfWeek={DayOfWeek.Monday}
            value={fechaFinDate}
            formatDate={formatDateDisplay}
            onSelectDate={(date) =>
              handleChange("fechaFin", date ? formatDateDisplay(date) : "")
            }
            textField={{
              className: fechaFinDate
                ? `${styles.datePickerField} ${styles.datePickerClearable}`
                : styles.datePickerField,
              onRenderSuffix: () =>
                fechaFinDate ? (
                  <IconButton
                    iconProps={{ iconName: "Clear" }}
                    title="Borrar fecha fin"
                    ariaLabel="Borrar fecha fin"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      handleChange("fechaFin", "");
                    }}
                    className={styles.dateClearButton}
                  />
                ) : null,
            }}
          />
        </div>
      );
    },
    [task.fechaFin, handleChange],
  );

  const elaboradorField = React.useMemo(() => {
    if (elaboradorSuggestions.length === 0) return null;
    return (
      <div className={styles.field}>
        <PeoplePicker
          key={`elaborador-${projectSelected || ""}-${elaboradorSuggestions
            .map((u) => String(u?.text || ""))
            .join("|")}-${elaboradorPreselected
            .map((u) => String(u?.text || ""))
            .join("|")}`}
          users={elaboradorSuggestions}
          label={"Elaboradores"}
          handleChange={handlePeoplePickerChange}
          preselectedItems={elaboradorPreselected}
        />
      </div>
    );
  }, [
    elaboradorSuggestions,
    elaboradorPreselected,
    projectSelected,
    handlePeoplePickerChange,
  ]);

  const aprobadoresField = React.useMemo(
    () => (
      <div className={styles.optionalTaskField}>
        <PeoplePicker
          users={elaboradorSuggestions}
          label={"Aprobadores"}
          preselectedItems={aprobadoresPreselected}
          handleChange={(items: any[]) => {
            const nombres =
              items?.map((i) => i.text as string).filter(Boolean) || [];
            setAprobadoresPreselected(
              nombres.map((name) => ({ key: name, text: name })),
            );
            handleChange("aprobadores", nombres);
          }}
        />
      </div>
    ),
    [elaboradorSuggestions, aprobadoresPreselected, handleChange],
  );

  const firmantesField = React.useMemo(
    () => (
      <div className={styles.optionalTaskField}>
        <PeoplePicker
          users={elaboradorSuggestions}
          label={"Firmantes"}
          preselectedItems={firmantesPreselected}
          handleChange={(items: any[]) => {
            const nombres =
              items?.map((i) => i.text as string).filter(Boolean) || [];
            handleChange("firmantes", nombres);
          }}
        />
      </div>
    ),
    [elaboradorSuggestions, firmantesPreselected, handleChange],
  );

  const deadlineField = React.useMemo(
    () => (
      <div className={styles.optionalTaskField}>
        <label>Fecha Deadline</label>
        <DatePicker
          firstDayOfWeek={DayOfWeek.Monday}
          value={parseDisplayToDate(task.fechaDeadline)}
          formatDate={formatDateDisplay}
          onSelectDate={(date) =>
            handleChange("fechaDeadline", date ? formatDateDisplay(date) : "")
          }
        />
      </div>
    ),
    [task.fechaDeadline, handleChange],
  );

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        {tareaSelected ? (
          <h2 className={styles.title}>Editar Tarea</h2>
        ) : (
          <h2 className={styles.title}>Alta de Tarea</h2>
        )}
        {tareaSelected && taskDetailUrl && (
          <a href={taskDetailUrl} className={styles.backToDetailBtn}>
            Volver al detalle
          </a>
        )}
      </div>

      {/* Información básica */}
      <section className={styles.section}>
        {
          !tareaSelected && (
            <div className={styles.templateSection}>
              <div className={styles.field}>
                <label>Plantillas de tareas</label>
                <select
                  value={selectedPlantillaId}
                  onChange={(e) => handlePlantillaChange(e.target.value)}
                >
                  <option value="">Selecciona una plantilla...</option>
                  {plantillasTarea.map((p) => (
                    <option key={p.id} value={String(p.idPlantilla || p.id)}>
                      {p.title || `Plantilla ${p.idPlantilla || p.id}`}
                    </option>
                  ))}
                </select>
              </div>

              {!tareaSelected && (
                <div className={styles.templateSaveBlock}>
                  <label className={styles.templateCheckbox}>
                    <input
                      type="checkbox"
                      checked={guardarPlantilla}
                      onChange={(e) => {
                        setGuardarPlantilla(e.target.checked);
                        if (!e.target.checked) {
                          setNombrePlantilla("");
                        }
                      }}
                    />
                    Guardar plantilla
                  </label>

                  {guardarPlantilla && (
                    <div className={styles.field}>
                      <label>Nombre de la plantilla</label>
                      <input
                        type="text"
                        value={nombrePlantilla}
                        onChange={(e) => setNombrePlantilla(e.target.value)}
                        placeholder="Escribe un nombre para la plantilla"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }

        <h3>Información General</h3>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label>Expediente</label>
            <input value={task.proyectoNombre} disabled />
          </div>

          <div className={styles.field}>
            <label>Estado</label>
            <input value={task.estado} disabled />
          </div>

          <div className={styles.field}>
            <label>Nombre de la tarea</label>
            <input
              value={task.nombre}
              onChange={(e) => handleChange("nombre", e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Responsable</label>
            <input type="text" value={task.responsable ?? ""} disabled />
          </div>
          {elaboradorField}

          {fechaInicioField}

          {fechaFinField}

          <div>
            <label>Grupo de documentos</label>
            <select
              value={task.carpetaDocumento}
              onChange={(e) => {
                void (async () => {
                  const value = e.target.value;
                  handleChange("carpetaDocumento", value);
                  if (!value) {
                    handleChange("carpeta", "");
                    setSelectedFolderUrl(null);
                  }
                  handleChange("tipoDocumento", "");
                  handleChange("esVersionable", false);
                  resetVersionableDocFlow();
                  setMetadatosTipo([]);
                  setDocuments((prev) =>
                    prev.map((d) => ({ ...d, metadatos: {} })),
                  );
                  const idCarpeta = value ? Number(value) : NaN;
                  if (!Number.isNaN(idCarpeta)) {
                    await loadTiposDocumentoPorCarpeta(idCarpeta);
                  } else {
                    setTiposDocumentoFiltrados([]);
                  }
                })();
              }}
              disabled={
                isEditMode ||
                !tipoExpedienteId ||
                gruposDocumento.length === 0
              }
            >
              <option value="">
                {!tipoExpedienteId
                  ? "Expediente sin tipo configurado"
                  : gruposDocumento.length
                    ? "Seleccionar"
                    : "Sin grupos disponibles"}
              </option>
              {gruposDocumento.map((grupo) => (
                <option key={grupo.idCarpeta} value={String(grupo.idCarpeta)}>
                  {grupo.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Tipo Documento</label>
            <select
              value={task.tipoDocumento}
              onChange={async (e) => {
                const value = e.target.value;
                resetVersionableDocFlow();
                handleChange("tipoDocumento", value);
                setMetadatosTipo([]);
                const selected = tiposDocumentoFiltrados.find(
                  (t) => t.Title === value,
                );
                handleChange("esVersionable", !!selected?.Versionable);
                if (selected) {
                  try {
                    const metas: any[] = await sp.web.lists
                      .getByTitle("MetadatosTiposDocumentos")
                      .items.filter(
                        `IDTipoDocumento eq ${selected.IDTipoDocumento}`,
                      )
                      .select("IDTipoMetadato", "Title", "ValorMetadato")
                      .top(5000)
                      .get();
                    const mappedMetas = metas.map((m) => ({
                      IdTipoMetadato: m.IDTipoMetadato as number,
                      Title: m.Title as string,
                      ValorMetadato: (m.ValorMetadato as string) || "",
                    }));
                    setMetadatosTipo(mappedMetas);
                    setDocuments((prev) =>
                      prev.map((d) => {
                        const defaults: Record<number, string> = {};
                        mappedMetas.forEach((meta) => {
                          if (meta.ValorMetadato) {
                            defaults[meta.IdTipoMetadato] = meta.ValorMetadato;
                          }
                        });
                        return {
                          ...d,
                          metadatos: defaults,
                        };
                      }),
                    );
                  } catch (err) {
                    console.log(
                      "Error cargando metadatos desde MetadatosTiposDocumentos:",
                      err,
                    );
                  }
                }
              }}
              disabled={isEditMode || !task.carpetaDocumento}
            >
              <option value="">Seleccionar</option>
              {tiposDocumentoFiltrados.map((tipo) => (
                <option key={tipo.Id} value={tipo.Title}>
                  {tipo.Acronimo
                    ? `${tipo.Title} (${tipo.Acronimo})`
                    : tipo.Title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Codificación del documento</label>
            <select
              value={String(task.patronNomenclatura ?? "")}
              onChange={(e) =>
                handleChange("patronNomenclatura", e.target.value)
              }
              disabled={isEditMode}
            >
              <option value="">Selecciona un patrón...</option>
              {patronesNomenclatura.map((p) => (
                <option key={p.Id} value={String(p.Id)}>
                  {p.Title} ({p.PatronNomenclatura})
                </option>
              ))}
            </select>
          </div>
        </div>

        {(task.requiereAprobacion ||
          task.requiereFirma ||
          task.tieneDeadline) && (
          <div className={styles.optionalTaskFieldsGrid}>
            {task.requiereAprobacion && aprobadoresField}
            {task.requiereFirma && firmantesField}
            {task.tieneDeadline && deadlineField}
          </div>
        )}

        {/* <div className={styles.folderBrowserSection}>
          <label>
            Seleccionar carpeta final de destino de los documentos asociados a
            la tarea.
          </label>
          <div className={styles.breadcrumb}>
            <button
              type="button"
              className={styles.breadcrumbItem}
              onClick={() => {
                if (!rootFolderUrl) return;
                void loadFolderLevel(rootFolderUrl, rootFolderUrl);
              }}
            >
              {task.proyectoId || "Expediente"}
            </button>
            {folderBreadcrumb.map((seg, idx) => (
              <React.Fragment key={`${seg}-${idx}`}>
                <span className={styles.breadcrumbSep}>/</span>
                <button
                  type="button"
                  className={styles.breadcrumbItem}
                  onClick={() => {
                    if (!rootFolderUrl) return;
                    const nextSegs = folderBreadcrumb.slice(0, idx + 1);
                    const targetUrl = `${rootFolderUrl}/${nextSegs.join("/")}`;
                    void loadFolderLevel(targetUrl, rootFolderUrl);
                  }}
                >
                  {seg}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className={styles.folderNavActions}>
            <button
              type="button"
              className={styles.backFolderBtn}
              onClick={handleBackFolderNavigation}
              disabled={!rootFolderUrl || folderBreadcrumb.length === 0}
            >
              Volver
            </button>
          </div>

          {currentFolderUrl && (
            <button
              type="button"
              className={styles.selectCurrentFolderBtn}
              onClick={() => setSelectedFolderUrl(currentFolderUrl)}
            >
              Seleccionar carpeta actual
            </button>
          )}

          {selectedFolderUrl && (
            <div className={styles.selectedFolderInfo}>
              Carpeta seleccionada:{" "}
              {selectedFolderUrl.split("/").slice(4).join("/")}
            </div>
          )}

          {folderTree.length === 0 ? (
            <p className={styles.folderEmpty}>
              No hay subcarpetas en este nivel.
            </p>
          ) : (
            <ul className={styles.folderTree}>
              {folderTree.map((f) => (
                <li key={f.serverRelativeUrl} className={styles.folderItemRow}>
                  <button
                    type="button"
                    className={styles.folderNode}
                    onClick={() => {
                      const root = rootFolderUrl || undefined;
                      void loadFolderLevel(f.serverRelativeUrl, root);
                    }}
                  >
                    <span className={styles.folderIcon}>📁</span>
                    <span>{f.name}</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.folderPickBtn} ${
                      selectedFolderUrl === f.serverRelativeUrl
                        ? styles.folderPickBtnSelected
                        : ""
                    }`}
                    onClick={() => setSelectedFolderUrl(f.serverRelativeUrl)}
                  >
                    Seleccionar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div> */}

        
<div>
          <label>Descripción</label>
          <textarea
            value={task.descripcion}
            onChange={(e) => handleChange("descripcion", e.target.value)}
          />
        </div>

        <div className={styles.checkboxGroup}>
          <label>
            <input
              type="checkbox"
              checked={task.esVersionable}
              disabled
              readOnly
            />
            Versionable
          </label>

          <label>
            <input
              type="checkbox"
              checked={task.entregable}
              onChange={(e) => handleChange("entregable", e.target.checked)}
            />
            Entregable
          </label>

          <label>
            <input
              type="checkbox"
              checked={task.requiereAprobacion}
              onChange={(e) =>
                handleChange("requiereAprobacion", e.target.checked)
              }
            />
            Requiere aprobación
          </label>

          <label>
            <input
              type="checkbox"
              checked={task.requiereFirma}
              onChange={(e) => handleChange("requiereFirma", e.target.checked)}
            />
            Requiere firma
          </label>

          {!task.requiereFirma && (
            <label>
              <input
                type="checkbox"
                checked={task.convertirAPDF}
                onChange={(e) =>
                  handleChange("convertirAPDF", e.target.checked)
                }
              />
              Convertir documento a PDF
            </label>
          )}

          <label>
            <input
              type="checkbox"
              checked={task.tieneDeadline}
              onChange={(e) => handleChange("tieneDeadline", e.target.checked)}
            />
            Tiene Deadline
          </label>
        </div>

        <div className={styles.carpetaDestinoPanel}>
          <div className={styles.carpetaDestinoHeader}>
            <div className={styles.carpetaDestinoIconWrap} aria-hidden="true">
              <span className={styles.carpetaDestinoIcon} />
            </div>
            <div className={styles.carpetaDestinoMeta}>
              <span className={styles.carpetaDestinoLabel}>Carpeta de destino</span>
              <span className={styles.carpetaDestinoHint}>
                Ubicación documental del expediente
                {proyectoIdActivo ? ` · ID ${proyectoIdActivo}` : ""}
              </span>
            </div>
          </div>
          {validatingCarpetaDestino && (
            <p className={styles.carpetaDestinoStatus}>
              Verificando carpeta de destino en DocumentacionArchivo...
            </p>
          )}
          {!validatingCarpetaDestino && carpetaDestinoExists === false && (
            <p className={styles.carpetaDestinoError}>{carpetaDestinoError}</p>
          )}
          {!validatingCarpetaDestino && carpetaDestinoExists === true && (
            <div className={styles.carpetaDestinoPathRow}>
              <span className={styles.carpetaDestinoRoot}>DocumentacionArchivo</span>
              {proyectoIdActivo && (
                <>
                  <span className={styles.carpetaDestinoSep}>/</span>
                  <span className={styles.carpetaDestinoSegment}>
                    {proyectoIdActivo}
                  </span>
                </>
              )}
              {carpetaDestinoDisplay.split("/").map((segment, index) => (
                <React.Fragment key={`${segment}-${index}`}>
                  <span className={styles.carpetaDestinoSep}>/</span>
                  <span className={styles.carpetaDestinoSegment}>{segment}</span>
                </React.Fragment>
              ))}
            </div>
          )}
          {!validatingCarpetaDestino &&
            carpetaDestinoExists !== true &&
            !carpetaDestinoError &&
            !task.carpetaDocumento && (
              <div className={styles.carpetaDestinoPathRow}>
                <span className={styles.carpetaDestinoRoot}>DocumentacionArchivo</span>
                {proyectoIdActivo && (
                  <>
                    <span className={styles.carpetaDestinoSep}>/</span>
                    <span className={styles.carpetaDestinoSegment}>
                      {proyectoIdActivo}
                    </span>
                  </>
                )}
                <span className={styles.carpetaDestinoSep}>/</span>
                <span className={styles.carpetaDestinoEmpty}>
                  Seleccione un grupo de documentos
                </span>
              </div>
            )}
        </div>

        {showVersionableDocModeQuestion && (
          <section
            className={`${styles.section} ${styles.versionableDocModeSection}`}
          >
            <div className={styles.versionableDocModePanel}>
              <div className={styles.versionableDocModeHeader}>
                <div
                  className={styles.versionableDocModeIconWrap}
                  aria-hidden="true"
                >
                  <span className={styles.versionableDocModeIcon} />
                </div>
                <div className={styles.versionableDocModeMeta}>
                  <span className={styles.versionableDocModeLabel}>
                    Tipo de documento versionable
                  </span>
                  <span className={styles.versionableDocModeHint}>
                    Indique si va a crear un documento nuevo o una nueva versión
                    de un documento existente.
                  </span>
                </div>
              </div>

              <div
                className={styles.versionableDocModeOptions}
                role="group"
                aria-label="Modo de creación del documento versionable"
              >
                <label
                  className={`${styles.versionableDocModeCard} ${
                    versionableDocMode === "nuevo"
                      ? styles.versionableDocModeCardSelected
                      : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.versionableDocModeInput}
                    checked={versionableDocMode === "nuevo"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVersionableDocMode("nuevo");
                        setSelectedVersionSourceDoc(null);
                        setVersionSourceDocError("");
                      } else if (versionableDocMode === "nuevo") {
                        setVersionableDocMode(null);
                      }
                    }}
                  />
                  <span
                    className={`${styles.versionableDocModeCardIcon} ${styles.versionableDocModeCardIconNew}`}
                    aria-hidden="true"
                  />
                  <span className={styles.versionableDocModeCardContent}>
                    <span className={styles.versionableDocModeCardTitle}>
                      Documento nuevo
                    </span>
                    <span className={styles.versionableDocModeCardDesc}>
                      Se asignará un nuevo número documental y versión 1.
                    </span>
                  </span>
                  <span
                    className={styles.versionableDocModeCheck}
                    aria-hidden="true"
                  />
                </label>

                <label
                  className={`${styles.versionableDocModeCard} ${
                    versionableDocMode === "nuevaVersion"
                      ? styles.versionableDocModeCardSelected
                      : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className={styles.versionableDocModeInput}
                    checked={versionableDocMode === "nuevaVersion"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setVersionableDocMode("nuevaVersion");
                        setSelectedVersionSourceDoc(null);
                        setVersionSourceDocError("");
                      } else if (versionableDocMode === "nuevaVersion") {
                        setVersionableDocMode(null);
                      }
                    }}
                  />
                  <span
                    className={`${styles.versionableDocModeCardIcon} ${styles.versionableDocModeCardIconVersion}`}
                    aria-hidden="true"
                  />
                  <span className={styles.versionableDocModeCardContent}>
                    <span className={styles.versionableDocModeCardTitle}>
                      Nueva versión
                    </span>
                    <span className={styles.versionableDocModeCardDesc}>
                      Seleccione un documento existente para incrementar su
                      versión.
                    </span>
                  </span>
                  <span
                    className={styles.versionableDocModeCheck}
                    aria-hidden="true"
                  />
                </label>
              </div>

              {versionableDocModeValidationError && (
                <p className={styles.versionableDocModeError}>
                  {versionableDocModeValidationError}
                </p>
              )}
            </div>
          </section>
        )}

        {showDestinationDocsReadOnly && (
          <section className={styles.section}>
            <h3>Documentos en carpeta de destino</h3>

            <ProjectDocumentation
              key={`readonly-${selectedFolderUrl}-${selectedTipoDocumento?.IDTipoDocumento}`}
              context={context}
              projectId={String(task.proyectoId || projectSelected || "")}
              libraryName="DocumentacionArchivo"
              initialFolderServerRelativeUrl={selectedFolderUrl}
              filterByIdTipo={selectedTipoDocumento?.IDTipoDocumento ?? null}
              selectable={false}
              allowUpload={false}
            />
          </section>
        )}

        {showVersionSourceDocPicker && (
          <section className={styles.section}>
            <h3>Seleccionar documento base</h3>
            <p className={styles.versionableDocModeBlockHint}>
              Seleccione el documento del que desea crear una nueva versión. Se
              muestra la última versión de cada número documental.
            </p>
            {versionSourceDocError && (
              <p className={styles.assignDocumentErrorText}>
                {versionSourceDocError}
              </p>
            )}
            {selectedVersionSourceDoc && !versionSourceDocError && (
              <p className={styles.versionSourceSelectionSummary}>
                Documento seleccionado: nº{" "}
                {selectedVersionSourceDoc.numeroDocumento}, versión{" "}
                {selectedVersionSourceDoc.versionDocumento}. La nueva tarea
                creará la versión{" "}
                {selectedVersionSourceDoc.versionDocumento + 1}.
              </p>
            )}
            <ProjectDocumentation
              key={`version-source-${selectedFolderUrl}-${selectedTipoDocumento?.IDTipoDocumento}`}
              context={context}
              projectId={String(task.proyectoId || projectSelected || "")}
              libraryName="DocumentacionArchivo"
              initialFolderServerRelativeUrl={selectedFolderUrl}
              filterByIdTipo={selectedTipoDocumento?.IDTipoDocumento ?? null}
              latestVersionPerNumeroOnly
              selectable
              singleSelection
              allowUpload={false}
              initialSelectedFileUrls={
                selectedVersionSourceDoc
                  ? [selectedVersionSourceDoc.fileRef]
                  : []
              }
              onSelectionChange={handleVersionSourceSelection}
            />
          </section>
        )}

        {showTareasPendientesPorTipo && (
          <section className={styles.section}>
            <h3>Tareas no finalizadas del tipo documental</h3>
            {loadingTareasPendientesTipo && (
              <p className={styles.pendingTasksEmpty}>Cargando tareas...</p>
            )}
            {!loadingTareasPendientesTipo && tareasPendientesTipoError && (
              <p className={styles.assignDocumentErrorText}>
                {tareasPendientesTipoError}
              </p>
            )}
            {!loadingTareasPendientesTipo &&
              !tareasPendientesTipoError &&
              tareasPendientesTipo.length === 0 && (
                <p className={styles.pendingTasksEmpty}>
                  No hay tareas no finalizadas para este tipo documental.
                </p>
              )}
            {!loadingTareasPendientesTipo &&
              !tareasPendientesTipoError &&
              tareasPendientesTipo.length > 0 && (
                <div className={styles.pendingTasksPanel}>
                  <table className={styles.pendingTasksTable}>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Tarea</th>
                        <th>Estado</th>
                        <th>Responsable</th>
                        <th>Elaboradores</th>
                        <th>N.º documento</th>
                        <th>Versión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tareasPendientesTipo.map((tareaItem) => {
                        const detailUrl = `${absolutePath}/SitePages/detalle-tarea.aspx?tareaid=${encodeURIComponent(
                          String(tareaItem.idTarea),
                        )}`;
                        return (
                          <tr key={tareaItem.idTarea}>
                            <td>{tareaItem.idTarea || "—"}</td>
                            <td>
                              <a
                                href={detailUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.pendingTaskLink}
                              >
                                {tareaItem.title || `Tarea ${tareaItem.idTarea}`}
                              </a>
                            </td>
                            <td>{tareaItem.estado || "—"}</td>
                            <td>{tareaItem.responsable || "—"}</td>
                            <td>
                              {tareaItem.elaborador
                                ? String(tareaItem.elaborador)
                                    .split(",")
                                    .map((n) => n.trim())
                                    .filter(Boolean)
                                    .join(" · ")
                                : "—"}
                            </td>
                            <td>
                              {tareaItem.numeroDocumento != null
                                ? tareaItem.numeroDocumento
                                : "—"}
                            </td>
                            <td>
                              {tareaItem.versionDocumento != null
                                ? tareaItem.versionDocumento
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        )}

      </section>

      {/* Documento */}
      {task.tipoDocumento && metadatosTipo.length > 0 && (
        <section className={styles.section}>
          <h3>Alta de Documento</h3>
          {renderDocs()}
          
        </section>
      )}

      {canEditAssignedDocument && (
        <section className={styles.section}>
          <h3>Documento asociado a la tarea</h3>
          <p className={styles.assignedDocHint}>
            Puedes cambiar el documento asociado seleccionando otro archivo.
          </p>
          <ProjectDocumentation
            context={context}
            projectId={String(task.proyectoId)}
            singleSelection={true}
            initialSelectedFileUrls={
              selectedTaskDocumentUrl ? [selectedTaskDocumentUrl] : []
            }
            onSelectionChange={({ selectedFileUrls }) => {
              const nextSelectedUrl =
                selectedFileUrls && selectedFileUrls.length > 0
                  ? selectedFileUrls[0]
                  : null;
              setSelectedTaskDocumentUrl(nextSelectedUrl);
              if (nextSelectedUrl) {
                setAssignDocumentError("");
              }
            }}
          />
          <div className={styles.selectedDocPreviewPanel}>
            <p className={styles.selectedDocPreviewTitle}>Documento seleccionado</p>
            {!selectedTaskDocumentUrl ? (
              <p className={styles.selectedDocPreviewEmpty}>
                Selecciona un documento.
              </p>
            ) : (
              <div className={styles.selectedDocPreviewItem}>
                <span className={styles.selectedDocPreviewIcon}>📄</span>
                <span className={styles.selectedDocPreviewName}>
                  {selectedTaskDocumentUrl.split("/").pop() ||
                    selectedTaskDocumentUrl}
                </span>
              </div>
            )}
          </div>
          {assignDocumentError && (
            <p className={styles.assignDocumentErrorText}>{assignDocumentError}</p>
          )}
        </section>
      )}

      {successMessage && (
        <div className={styles.successMessage}>{successMessage}</div>
      )}
      {error && <ErrorAlert message={error} onRetry={() => setError(false)} />}
      <button
        className={styles.submitBtn}
        onClick={handleSubmit}
        disabled={isSavingTask || saveFinishedRedirecting}
      >
        {isSavingTask || saveFinishedRedirecting
          ? saveFinishedRedirecting
            ? "Redirigiendo..."
            : "Guardando tarea..."
          : "Guardar Tarea"}
      </button>
    </div>
  );
};

export default NewTask;
