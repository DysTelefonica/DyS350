// @ts-nocheck
import * as React from "react";
import styles from "./TaskDetail.module.scss";
import type {
  IFlowUser,
  ITaskDetail,
  ITaskDetailProps,
} from "./ITaskDetailProps";
import { sp } from "@pnp/sp";
import Loading from "../../../ui/loading/Loading";
import ProjectDocumentation from "../../../ui/projectDocumentation/ProjectDocumentation";
import { moveFileAvoidingMaxUrlLength } from "./closeVersionArchiveUtils";
import { replaceTaskDocumentFile, resolveServerRelativeDocumentUrl } from "./taskDocumentReplaceUtils";

const formatDate = (value?: string): string => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES");
};

const isPastDisplayDate = (value?: string): boolean => {
  const raw = String(value || "").trim();
  if (!raw) return false;

  const parts = raw.split("/");
  if (parts.length !== 3) return false;

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!day || !month || !year) return false;

  const deadlineDate = new Date(year, month - 1, day);
  if (isNaN(deadlineDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  return deadlineDate < today;
};

const toIsoDateOnly = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeText = (value = ""): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const formatMultilineComment = (value?: string): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Cuando SharePoint guarda texto multilínea como HTML, convertimos a texto plano.
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>\s*<div>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");

  const decoder = document.createElement("textarea");
  decoder.innerHTML = withoutTags;
  return decoder.value.trim();
};

const getFolderUrlFromDocumentUrl = (url: string): string => {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";
  const lastSegment = cleanUrl.split("/").pop() || "";
  if (lastSegment.includes(".")) {
    return cleanUrl.replace(/\/[^/]+$/, "");
  }
  return cleanUrl;
};

/**
 * PDF convertido: mismo nombre base + "_IDDocumento.pdf"
 * (p. ej. Informe.docx → Informe_123.pdf).
 */
const buildConvertedPdfServerRelativeUrl = (
  documentUrl: string,
  idDocumento: number,
  webServerRelativeUrl: string,
): string => {
  const normalized = resolveServerRelativeDocumentUrl(
    documentUrl,
    webServerRelativeUrl,
  );
  if (!normalized || !idDocumento) return "";
  const fileName = normalized.split("/").pop() || "";
  if (!fileName) return "";
  const suffix = `_${idDocumento}.pdf`;
  const fileNameLower = fileName.toLowerCase();
  if (fileNameLower.endsWith(suffix.toLowerCase())) {
    return normalized;
  }
  const folder = getFolderUrlFromDocumentUrl(normalized);
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.substring(0, dot) : fileName;
  return resolveServerRelativeDocumentUrl(
    `${folder}/${base}${suffix}`,
    webServerRelativeUrl,
  );
};

const fileExistsByServerRelativeUrl = async (
  serverRelativeUrl: string,
): Promise<boolean> => {
  const url = String(serverRelativeUrl || "").trim();
  if (!url) return false;
  try {
    await sp.web.getFileByServerRelativeUrl(url).select("Name").get();
    return true;
  } catch {
    return false;
  }
};

/**
 * Localiza el PDF asociado en DocumentacionTrabajo filtrando por IDDocumento.
 * Puede haber DOCX + PDF con el mismo ID; se devuelve el PDF.
 */
const findCompanionPdfByIdDocumento = async (
  idDocumento: number,
  webServerRelativeUrl: string,
): Promise<string | null> => {
  if (!Number.isFinite(idDocumento) || idDocumento <= 0) return null;
  try {
    const items: any[] = await sp.web.lists
      .getByTitle("DocumentacionTrabajo")
      .items.filter(`IDDocumento eq ${idDocumento}`)
      .select("FileRef", "FileLeafRef")
      .top(20)
      .get();
    const pdfItem = items.find((it) => {
      const leaf = String(it.FileLeafRef || "")
        .trim()
        .toLowerCase();
      const fromRef = String(it.FileRef || "")
        .trim()
        .toLowerCase();
      return leaf.endsWith(".pdf") || fromRef.endsWith(".pdf");
    });
    const fileRef = String(pdfItem?.FileRef || "").trim();
    if (!fileRef) return null;
    return (
      resolveServerRelativeDocumentUrl(fileRef, webServerRelativeUrl) || null
    );
  } catch (e) {
    console.warn("No se pudo localizar el PDF por IDDocumento:", e);
    return null;
  }
};

const padCloseVersionValue = (value: string | number, size: number): string =>
  String(value).padStart(size, "0");

const getFileBaseName = (fileName: string): string => {
  const raw = String(fileName || "").trim();
  if (!raw) return "";
  const dot = raw.lastIndexOf(".");
  return dot > 0 ? raw.substring(0, dot) : raw;
};

/** Quita el sufijo `_IDDocumento` antes de la extensión (p. ej. Informe_59.pdf → Informe.pdf). */
const stripIdDocumentoFromFileName = (
  fileName: string,
  idDocumento?: number | null,
): string => {
  const leaf = String(fileName || "").trim();
  if (!leaf || idDocumento === null || idDocumento === undefined) return leaf;
  const idNum = Number(idDocumento);
  if (!Number.isFinite(idNum) || idNum <= 0) return leaf;
  const dot = leaf.lastIndexOf(".");
  const base = dot > 0 ? leaf.substring(0, dot) : leaf;
  const ext = dot > 0 ? leaf.substring(dot) : "";
  const suffix = `_${idNum}`;
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) {
    return `${base.slice(0, -suffix.length)}${ext}`;
  }
  return leaf;
};

/** Prefijo `TT-XXXXXX-AA-vBB-` aplicado en cierre de versión con patrón de nomenclatura. */
const buildCloseVersionNamePrefix = (params: {
  usesPatternNomenclatura: boolean;
  tipoAcronimo?: string;
  ordinalE2E?: string;
  numeroDocumento?: string | number | null;
  versionDocumento?: string | number | null;
}): string => {
  if (!params.usesPatternNomenclatura) return "";
  const tt = String(params.tipoAcronimo || "").trim() || "TT";
  const xxxx = padCloseVersionValue(params.ordinalE2E || "0", 6);
  const aaP = padCloseVersionValue(
    String(params.numeroDocumento ?? "").trim() || "0",
    2,
  );
  const bbP = padCloseVersionValue(
    String(params.versionDocumento ?? "").trim() || "0",
    2,
  );
  return `${tt}-${xxxx}-${aaP}-v${bbP}-`;
};

interface ICloseVersionDestNameParams {
  fileName: string;
  version: string;
  aa: string;
  usesPatternNomenclatura: boolean;
  tipoAcronimo?: string;
  ordinalE2E?: string;
  customName?: string;
  isMandatoryPdf?: boolean;
  mandatoryOriginalBase?: string;
  idDocumento?: number;
}

/** Nombre definitivo del fichero para el cierre de versión (nombreDestino). */
const buildCloseVersionDestFileName = (
  params: ICloseVersionDestNameParams,
): string => {
  const fileName = String(params.fileName || "").trim();
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.substring(dotIndex) : "";
  const version = String(params.version || "").trim();
  const aa = String(params.aa || "").trim();

  if (
    params.isMandatoryPdf &&
    params.idDocumento !== undefined
  ) {
    const idSuffix = `_${params.idDocumento}`;
    const preferredBase = String(params.mandatoryOriginalBase || "").trim();
    let pdfNameBase: string;
    // Sin patrón: el nombre del PDF sigue la base del docx (incl. renombre manual).
    if (!params.usesPatternNomenclatura && preferredBase) {
      pdfNameBase = preferredBase
        .toLowerCase()
        .endsWith(idSuffix.toLowerCase())
        ? preferredBase
        : `${preferredBase}${idSuffix}`;
    } else if (base.toLowerCase().endsWith(idSuffix.toLowerCase()) && base) {
      // Si el PDF ya es Nombre_IDDocumento.pdf, conservar ese nombre base.
      pdfNameBase = base;
    } else {
      pdfNameBase = `${preferredBase || base}_${params.idDocumento}`;
    }
    if (params.usesPatternNomenclatura) {
      const tt = params.tipoAcronimo || "TT";
      const xxxx = padCloseVersionValue(params.ordinalE2E || "0", 6);
      const aaP = padCloseVersionValue(aa, 2);
      const bbP = padCloseVersionValue(version, 2);
      return `${tt}-${xxxx}-${aaP}-v${bbP}-${pdfNameBase}.pdf`;
    }
    return `${pdfNameBase}.pdf`;
  }

  if (params.usesPatternNomenclatura) {
    const prefix = buildCloseVersionNamePrefix({
      usesPatternNomenclatura: true,
      tipoAcronimo: params.tipoAcronimo,
      ordinalE2E: params.ordinalE2E,
      numeroDocumento: aa,
      versionDocumento: version,
    });
    return `${prefix}${base}${ext}`;
  }

  const customNameRaw = String(params.customName || "").trim();
  if (customNameRaw) {
    const hasExt = /\.[^./\\]+$/.test(customNameRaw);
    return hasExt ? customNameRaw : `${customNameRaw}${ext}`;
  }

  return `${base}_v${version}${ext}`;
};

const serverRelativeToOpenUrl = (
  serverRelativeOrAbsolute: string,
  webAbsoluteUrl: string,
): string => {
  const s = String(serverRelativeOrAbsolute || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  try {
    const origin = new URL(webAbsoluteUrl).origin;
    if (s.startsWith("/")) return `${origin}${s}`;
    return `${webAbsoluteUrl.replace(/\/$/, "")}/${s}`;
  } catch {
    return s;
  }
};

const resolveArchiveRootServerRelative = (
  carpetaDestino: string,
  webServerRelativeUrlNoTrailing: string,
): string => {
  const taskDestinationRaw = String(carpetaDestino || "").trim();
  if (!taskDestinationRaw) return "";
  return taskDestinationRaw.startsWith("/")
    ? taskDestinationRaw.replace(/\/$/, "")
    : `${webServerRelativeUrlNoTrailing}/${taskDestinationRaw
        .replace(/^\/+/, "")
        .replace(/\/$/, "")}`;
};

const getRelativePathAfterProjectId = (
  folderPath: string,
  projectId: string | number | null,
): string => {
  const cleanPath = String(folderPath || "").trim();
  const projectIdText = String(projectId || "").trim();
  if (!cleanPath || !projectIdText) return cleanPath;

  const parts = cleanPath.split("/").filter(Boolean);
  const projectIndex = parts.findIndex((p) => p === projectIdText);
  if (projectIndex < 0) return cleanPath;

  const relativeParts = parts.slice(projectIndex + 1);
  return relativeParts.join("/") || cleanPath;
};

interface Props {
  title: string;
  items: IFlowUser[];
  onClose: () => void;
  showOrden?: boolean;
  showComentario?: boolean;
}

interface IRevisionItem {
  id: number;
  title: string;
  idRevisor?: string;
  orden: number;
  estadoRevision: string;
  comentario?: string;
  fechaRevision?: string;
}

interface IFirmaItem {
  id: number;
  title: string;
  idFirmante?: string;
  estadoFirma: string;
  fechaFirma?: string;
}

const TaskModal: React.FC<Props> = ({
  title,
  items,
  onClose,
  showOrden = true,
  showComentario = true,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✖
          </button>
        </div>
        <div className={styles.modalBody}>
          <table className={styles.table}>
            <thead>
              <tr>
                {showOrden && <th>Orden</th>}
                <th>Usuario</th>
                <th>Estado</th>
                <th>Fecha</th>
                {showComentario && <th>Comentario</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.orden}>
                  {showOrden && <td>{i.orden}</td>}
                  <td>{i.usuario.nombre}</td>
                  <td>{i.estado}</td>
                  <td>{i.fecha || "-"}</td>
                  {showComentario && (
                    <td style={{ whiteSpace: "pre-wrap" }}>
                      {formatMultilineComment(i.comentario) || "-"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TaskDetail: React.FC<ITaskDetailProps> = ({ context }) => {
  const [task, setTask] = React.useState<ITaskDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [showAprobadores, setShowAprobadores] = React.useState(false);
  const [showFirmantes, setShowFirmantes] = React.useState(false);
  const [taskId, setTaskId] = React.useState<string | null>(null);
  const [idProyecto, setIdProyecto] = React.useState<string | null>(null);
  const [selectedFolderUrl, setSelectedFolderUrl] = React.useState<
    string | null
  >(null);
  const [selectedFolderUrlSaved, setSelectedFolderUrlSaved] = React.useState<
    string | null
  >(null);
  /** FileRef del documento principal copiado en DocumentacionArchivo (Versionado / Fin). */
  const [archivedPrincipalFileRef, setArchivedPrincipalFileRef] =
    React.useState<string | null>(null);
  const [assignedDocumentTitulo, setAssignedDocumentTitulo] =
    React.useState<string>("");
  const [assignedDocumentId, setAssignedDocumentId] = React.useState<
    number | undefined
  >(undefined);
  const [isDownloadingAssignedDoc, setIsDownloadingAssignedDoc] =
    React.useState(false);
  const [assignDocumentError, setAssignDocumentError] = React.useState<
    string | null
  >(null);
  const [savingDocLocation, setSavingDocLocation] = React.useState(false);
  const savingDocLocationRef = React.useRef(false);
  /** Tras asignar OK: no reactivar el botón (evita doble asignación / sobrescritura). */
  const [documentAssignCompleted, setDocumentAssignCompleted] =
    React.useState(false);
  const documentAssignCompletedRef = React.useRef(false);
  const [isUpdatingTaskStatus, setIsUpdatingTaskStatus] = React.useState(false);
  const [taskUpdateSuccess, setTaskUpdateSuccess] = React.useState<
    string | null
  >(null);
  const [revisiones, setRevisiones] = React.useState<IRevisionItem[]>([]);
  const [firmas, setFirmas] = React.useState<IFirmaItem[]>([]);
  const [revisionComment, setRevisionComment] = React.useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = React.useState(false);
  const [isSubmittingFirma, setIsSubmittingFirma] = React.useState(false);
  const [firmanteSignedLocalFile, setFirmanteSignedLocalFile] =
    React.useState<File | null>(null);
  const firmanteSignedFileInputRef = React.useRef<HTMLInputElement>(null);
  const [showConfirmFirmaDialog, setShowConfirmFirmaDialog] =
    React.useState(false);
  const [firmanteDocumentError, setFirmanteDocumentError] = React.useState<
    string | null
  >(null);
  const [canCloseVersion, setCanCloseVersion] = React.useState(false);
  const [isLoadingCloseVersionPerm, setIsLoadingCloseVersionPerm] =
    React.useState(false);
  const [pdfConvertedReady, setPdfConvertedReady] = React.useState(true);
  const [isCheckingPdfConversion, setIsCheckingPdfConversion] =
    React.useState(false);
  /** Tras cerrar versión: el flujo copia a Archivo; true cuando el doc ya existe. */
  const [archiveCopyReady, setArchiveCopyReady] = React.useState(true);
  const [isCheckingArchiveCopy, setIsCheckingArchiveCopy] =
    React.useState(false);
  const [canEditTask, setCanEditTask] = React.useState(false);

  const [showCerrarVersionModal, setShowCerrarVersionModal] =
    React.useState(false);
  const [showConfirmCerrarVersionDialog, setShowConfirmCerrarVersionDialog] =
    React.useState(false);
  const [closeVersionSelectedFiles, setCloseVersionSelectedFiles] =
    React.useState<string[]>([]);
  const [closeCustomNames, setCloseCustomNames] = React.useState<
    Record<string, string>
  >({});
  const [requiredTaskDocFileUrl, setRequiredTaskDocFileUrl] = React.useState<
    string | null
  >(null);
  const [requiredTaskDocFileName, setRequiredTaskDocFileName] =
    React.useState("");
  const [closeVersionPreviewMeta, setCloseVersionPreviewMeta] = React.useState<{
    tipoAcronimo: string;
    ordinalE2E: string;
    idDocumento?: number;
    nombreDocumento: string;
    companionPdfUrl: string | null;
  }>({
    tipoAcronimo: "",
    ordinalE2E: "",
    nombreDocumento: "",
    companionPdfUrl: null,
  });
  const [isClosingVersion, setIsClosingVersion] = React.useState(false);
  const [closeVersionError, setCloseVersionError] = React.useState<
    string | null
  >(null);
  const absolutePath = context.pageContext.web.absoluteUrl;
  const webServerRelativePath = context.pageContext.web.serverRelativeUrl.replace(
    /\/$/,
    "",
  );

  React.useEffect(() => {
    sp.setup({ spfxContext: context });
  }, [context]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tareaSelected = params.get("tareaid");
    setTaskId(tareaSelected);
  }, []);
  const loadTask = async () => {
    try {
      setError(null);
      if (!taskId) {
        setTask(null);
        return;
      }
      const idTarea = parseInt(taskId, 10);
      if (isNaN(idTarea)) {
        setError("ID de tarea no válido.");
        setTask(null);
        return;
      }

      const items: any[] = await sp.web.lists
        .getByTitle("TareasDocumentales")
        .items.filter(`IDTarea eq ${idTarea}`)
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
          "EsVersionable",
          "EsEntregable",
          "TieneDeadline",
          "FechaDeadline",
          "RequiereAprobacion",
          "RequiereFirma",
          "ConvertirAPDF",
          "ListaAprobadores",
          "ListaFirmantes",
          "Elaborador",
          "NumeroDocumento",
          "VersionDocumento",
          "Acronimo",
          "EstadoArchivado",
        )
        .top(1)
        .get();

      if (!items.length) {
        setError("No se ha encontrado la tarea solicitada.");
        setTask(null);
        return;
      }

      const item = items[0];
      const idProyecto = item.IDProyecto as number | undefined;
      let proyectoNombre = "";
      let ordinalE2E = "";
      if (idProyecto !== undefined && idProyecto !== null) {
        const expItems: any[] = await sp.web.lists
          .getByTitle("Expedientes")
          .items.filter(`IDExpediente eq ${idProyecto}`)
          .select("Title", "OrdinalE2E")
          .top(1)
          .get();
        proyectoNombre = expItems[0]?.Title || "";
        ordinalE2E = String(expItems[0]?.OrdinalE2E || "").trim();
      }

      let tipoNombre = "";
      let tipoAcronimo = String(item.Acronimo || "").trim();
      const idTipo = item.IDTipo as number | undefined;
      if (idTipo !== undefined && idTipo !== null) {
        try {
          const tipoItem: any = await sp.web.lists
            .getByTitle("TiposDocumentacion")
            .items.filter(`IDTipoDocumento eq ${idTipo} and Activo eq 1`)
            .select("Title", "Acronimo")
            .top(1)
            .get();
          tipoNombre = (tipoItem[0].Title as string) || "";
          if (!tipoAcronimo) {
            tipoAcronimo = String(tipoItem[0]?.Acronimo || "").trim();
          }
        } catch {
          tipoNombre = "";
        }
      }

      const parseFlowUsers = (
        raw: string | null | undefined,
        revisionesData: IRevisionItem[] = [],
      ): IFlowUser[] => {
        if (!raw) return [];
        const lines = raw
          .split(/[;\r\n]+/)
          .map((l) => l.trim())
          .filter(Boolean);
        return lines.map((name, index) => {
          const revisionByOrden = revisionesData.find(
            (r) => r.orden === index + 1,
          );
          const revisionByTitle = revisionesData.find(
            (r) => normalizeText(r.title) === normalizeText(name),
          );
          const revision = revisionByOrden || revisionByTitle;
          const estadoRevision = (revision?.estadoRevision || "Pendiente") as
            | "Pendiente"
            | "Aprobado"
            | "Rechazado";
          return {
            orden: index + 1,
            usuario: { id: index + 1, nombre: name },
            estado: estadoRevision,
            fecha: revision?.fechaRevision
              ? formatDate(revision.fechaRevision)
              : undefined,
            comentario: revision?.comentario || undefined,
          };
        });
      };

      const revisionesItems: any[] = await sp.web.lists
        .getByTitle("Revisiones")
        .items.filter(`IDTareaDocumental eq ${idTarea}`)
        .select(
          "ID",
          "Title",
          "IDRevisor",
          "Orden",
          "EstadoRevision",
          "Comentario",
          "FechaRevision",
        )
        .top(5000)
        .getAll();

      const revisionesMapped: IRevisionItem[] = revisionesItems
        .map((r) => ({
          id: r.ID as number,
          title: (r.Title as string) || "",
          idRevisor: (r.IDRevisor as string) || "",
          orden: Number(r.Orden || 0),
          estadoRevision: (r.EstadoRevision as string) || "",
          comentario: (r.Comentario as string) || "",
          fechaRevision: (r.FechaRevision as string) || "",
        }))
        .sort((a, b) => a.orden - b.orden);

      const aprobadores = parseFlowUsers(
        (item.ListaAprobadores as string) || "",
        revisionesMapped,
      );
      const firmantes = parseFlowUsers((item.ListaFirmantes as string) || "");

      const mapped: ITaskDetail = {
        proyectoNombre,
        nombre: (item.Title as string) || "",
        descripcion: (item.DescripcionTarea as string) || "",
        estado: (item.EstadoTarea as ITaskDetail["estado"]) || "AltaTareaDoc",
        responsable: (item.Responsable as string) || "",
        elaborador: (item.Elaborador as string) || "",
        carpetaDestino: (item.Carpeta as string) || "",
        fechaInicio: formatDate(item.FechaInicioTarea as string),
        fechaFin: formatDate(item.FechaFinTarea as string),
        tipoDocumento: { nombre: tipoNombre },
        idTipo:
          item.IDTipo !== null &&
          item.IDTipo !== undefined &&
          !Number.isNaN(Number(item.IDTipo))
            ? Number(item.IDTipo)
            : undefined,
        patronNomenclaturaId:
          item.PatronNomenclatura !== null &&
          item.PatronNomenclatura !== undefined &&
          !Number.isNaN(Number(item.PatronNomenclatura))
            ? Number(item.PatronNomenclatura)
            : undefined,
        esVersionable:
          item.EsVersionable === null || item.EsVersionable === undefined
            ? true
            : !!item.EsVersionable,
        esEntregable: !!item.EsEntregable,
        requiereAprobacion: !!item.RequiereAprobacion,
        requiereFirma: !!item.RequiereFirma,
        convertirAPDF: !!item.ConvertirAPDF,
        aprobadores,
        firmantes,
        tieneDeadline: !!item.TieneDeadline,
        fechaDeadline: formatDate(item.FechaDeadline as string) || undefined,
        numeroDocumento:
          item.NumeroDocumento !== null &&
          item.NumeroDocumento !== undefined &&
          !Number.isNaN(Number(item.NumeroDocumento))
            ? Number(item.NumeroDocumento)
            : undefined,
        versionDocumento:
          item.VersionDocumento !== null &&
          item.VersionDocumento !== undefined &&
          !Number.isNaN(Number(item.VersionDocumento))
            ? Number(item.VersionDocumento)
            : undefined,
        acronimo: tipoAcronimo || undefined,
        ordinalE2E: ordinalE2E || undefined,
        estadoArchivado: String(item.EstadoArchivado || "").trim() || undefined,
      };

      setTask(mapped);
      setIdProyecto(idProyecto);
      setRevisionComment("");
      setFirmanteSignedLocalFile(null);
      setRevisiones(revisionesMapped);

      // Cargar firmas actuales desde la lista "Firmas"
      try {
        const firmasItems: any[] = await sp.web.lists
          .getByTitle("Firmas")
          .items.filter(`IDTareaDocumental eq ${idTarea}`)
          .select("ID", "Title", "IDFirmante", "EstadoFirma", "FechaFirma")
          .top(5000)
          .getAll();

        const firmasMapped: IFirmaItem[] = firmasItems.map((f) => ({
          id: f.ID as number,
          title: (f.Title as string) || "",
          idFirmante: (f.IDFirmante as string) || "",
          estadoFirma: (f.EstadoFirma as string) || "",
          fechaFirma: (f.FechaFirma as string) || "",
        }));
        setFirmas(firmasMapped);

        // Re-alimentamos task.firmantes para el modal desde la lista "Firmas"
        const firmantesDesdeFirmas: IFlowUser[] = firmasMapped.map((f, idx) => {
          const estadoFirm = normalizeText(f.estadoFirma || "");
          const estado: IFlowUser["estado"] =
            estadoFirm === "aprobado"
              ? "Aprobado"
              : estadoFirm === "pendiente"
                ? "Pendiente"
                : "Pendiente";

          return {
            orden: idx + 1,
            usuario: { id: idx + 1, nombre: f.title },
            estado,
            fecha: f.fechaFirma ? formatDate(f.fechaFirma) : undefined,
          };
        });

        setTask((prev) =>
          prev
            ? {
                ...prev,
                firmantes: firmantesDesdeFirmas,
              }
            : prev,
        );
      } catch {
        setFirmas([]);
      }

      // Cargar posible UrlDocumento ya asignada en DocumentoPrincipal
      setArchivedPrincipalFileRef(null);
      setAssignedDocumentTitulo("");
      setAssignedDocumentId(undefined);
      setPdfConvertedReady(true);
      setIsCheckingPdfConversion(false);
      setArchiveCopyReady(true);
      setIsCheckingArchiveCopy(false);
      try {
        const tareaDocs: any[] = await sp.web.lists
          .getByTitle("DocumentoPrincipal")
          .items.filter(`IDTarea eq ${idTarea}`)
          .select("UrlDocumento", "IDDocumento")
          .top(1)
          .get();
        const docUrlRaw =
          tareaDocs.length && tareaDocs[0].UrlDocumento
            ? String(tareaDocs[0].UrlDocumento)
            : "";
        if (docUrlRaw) {
          setSelectedFolderUrlSaved(docUrlRaw);
        } else {
          setSelectedFolderUrlSaved(null);
        }

        const estadoArchivo = String(item.EstadoTarea || "").trim();
        const estadoArchivadoNorm = normalizeText(
          String(item.EstadoArchivado || ""),
        );
        const convertirAPDF = !!item.ConvertirAPDF;
        const idDocRaw = tareaDocs[0]?.IDDocumento;
        const idDocumentoNum =
          idDocRaw !== null &&
          idDocRaw !== undefined &&
          !Number.isNaN(Number(idDocRaw))
            ? Number(idDocRaw)
            : undefined;
        if (idDocumentoNum !== undefined) {
          setAssignedDocumentId(idDocumentoNum);
        }

        if (
          estadoArchivo === "Aprobado" &&
          convertirAPDF &&
          (firmantes || []).length === 0 &&
          idDocumentoNum !== undefined &&
          docUrlRaw
        ) {
          setIsCheckingPdfConversion(true);
          const webSrv = context.pageContext.web.serverRelativeUrl.replace(
            /\/$/,
            "",
          );
          const expectedPdfUrl = buildConvertedPdfServerRelativeUrl(
            docUrlRaw,
            idDocumentoNum,
            webSrv,
          );
          const pdfExists = await fileExistsByServerRelativeUrl(expectedPdfUrl);
          setPdfConvertedReady(pdfExists);
          setIsCheckingPdfConversion(false);
        } else {
          setPdfConvertedReady(true);
        }

        if (
          (estadoArchivo === "Versionado" || estadoArchivo === "Fin") &&
          tareaDocs.length
        ) {
          const carpetaDest = String(item.Carpeta || "").trim();
          const waitingArchiveCopy = estadoArchivadoNorm === "pendiente";
          if (waitingArchiveCopy) {
            setIsCheckingArchiveCopy(true);
            setArchiveCopyReady(false);
          }

          if (idDocumentoNum !== undefined && carpetaDest) {
            const webSrv = context.pageContext.web.serverRelativeUrl.replace(
              /\/$/,
              "",
            );
            const archiveRoot = resolveArchiveRootServerRelative(
              carpetaDest,
              webSrv,
            );
            const escapeODataValue = (value: string): string =>
              value.replace(/'/g, "''");
            const archItems: any[] = await sp.web.lists
              .getByTitle("DocumentacionArchivo")
              .items.filter(
                `FileDirRef eq '${escapeODataValue(archiveRoot)}' and IDDocumento eq ${idDocumentoNum}`,
              )
              .select("FileRef", "Modified")
              .orderBy("Modified", false)
              .top(1)
              .get();
            const fileRef = String(archItems[0]?.FileRef || "").trim();
            if (fileRef) {
              setArchivedPrincipalFileRef(fileRef);
              setArchiveCopyReady(true);
            } else if (waitingArchiveCopy) {
              setArchiveCopyReady(false);
            } else {
              setArchiveCopyReady(true);
            }
          } else if (waitingArchiveCopy) {
            setArchiveCopyReady(false);
          } else {
            setArchiveCopyReady(true);
          }
          setIsCheckingArchiveCopy(false);
        } else {
          setArchiveCopyReady(true);
          setIsCheckingArchiveCopy(false);
        }
      } catch {
        // ignoramos errores de carga de DocumentoPrincipal / archivo
        setPdfConvertedReady(true);
        setIsCheckingPdfConversion(false);
        setArchiveCopyReady(true);
        setIsCheckingArchiveCopy(false);
      }
    } catch (err) {
      console.error("Error cargando detalle de tarea:", err);
      setError("No se ha podido cargar la información de la tarea.");
      setTask(null);
    }
  };

  React.useEffect(() => {
    void loadTask();
  }, [taskId]);

  const actualizarEstadoTarea = async (nuevoEstado: ITaskDetail["estado"]) => {
    if (!taskId) return;
    setTaskUpdateSuccess(null);
    const tareaNum = parseInt(taskId, 10);
    if (isNaN(tareaNum)) {
      setError("ID de tarea no válido.");
      return;
    }
    try {
      setIsUpdatingTaskStatus(true);
      const tareasList = sp.web.lists.getByTitle("TareasDocumentales");
      const tareaItems: any[] = await tareasList.items
        .filter(`IDTarea eq ${tareaNum}`)
        .select("ID")
        .top(1)
        .get();
      if (!tareaItems.length) return;
      await tareasList.items.getById(tareaItems[0].ID as number).update({
        EstadoTarea: nuevoEstado,
        Estado: nuevoEstado,
      });

      // Al reenviar a revisión desde Borrador, se reinicia el circuito de revisiones.
      if (nuevoEstado === "EnRevision") {
        const revisionesList = sp.web.lists.getByTitle("Revisiones");
        const revisionesTarea: any[] = await revisionesList.items
          .filter(`IDTareaDocumental eq ${tareaNum}`)
          .select("ID")
          .top(5000)
          .getAll();
        for (const rev of revisionesTarea) {
          await revisionesList.items.getById(rev.ID as number).update({
            EstadoRevision: "Pendiente",
            Comentario: "",
            FechaRevision: null,
          });
        }
      }

      setTask((prev) => (prev ? { ...prev, estado: nuevoEstado } : prev));
      setTaskUpdateSuccess("La tarea se ha actualizado exitosamente.");
      await loadTask();
    } catch (e) {
      console.error("Error actualizando estado de tarea:", e);
      setError("No se ha podido actualizar el estado de la tarea.");
    } finally {
      setIsUpdatingTaskStatus(false);
    }
  };

  const checkCloseVersionPermission = async () => {
    try {
      if (!task || !idProyecto) {
        setCanCloseVersion(false);
        return;
      }
      if (task.estado !== "Aprobado") {
        setCanCloseVersion(false);
        return;
      }

      setIsLoadingCloseVersionPerm(true);

      const currentUserName = context.pageContext.user.displayName || "";
      const currentUserEmail = context.pageContext.user.email || "";
      // const currentUserNameNorm = normalizeText("Director Contrato Marco");
      const currentUserNameNorm = normalizeText(currentUserName);
      const currentUserEmailNorm = normalizeText(currentUserEmail);

      const responsableNorm = normalizeText(task.responsable || "");
      const elaboradoresNorm = String(task.elaborador || "")
        .split(",")
        .map((n) => normalizeText(n))
        .filter(Boolean);

      const isResponsable =
        !!responsableNorm &&
        (responsableNorm === currentUserNameNorm ||
          responsableNorm === currentUserEmailNorm);

      const isElaborador =
        elaboradoresNorm.includes(currentUserNameNorm) ||
        elaboradoresNorm.includes(currentUserEmailNorm);

      if (isResponsable || isElaborador) {
        setCanCloseVersion(true);
        return;
      }

      const idExpedienteNum =
        typeof idProyecto === "number"
          ? idProyecto
          : parseInt(String(idProyecto), 10);
      if (!idExpedienteNum || Number.isNaN(idExpedienteNum)) {
        setCanCloseVersion(false);
        return;
      }

      const roleNamesForCloseVersion = new Set(
        ["Técnicos de calidad", "Técnicos de documentación"].map((name) =>
          normalizeText(name),
        ),
      );
      const rolesConfigRaw: any[] = await sp.web.lists
        .getByTitle("Roles")
        .items.select("IDRol", "Title")
        .top(5000)
        .getAll();

      const roleIdsForCloseVersion = rolesConfigRaw
        .filter((r) =>
          roleNamesForCloseVersion.has(normalizeText(r?.Title || "")),
        )
        .map((r) => Number(r?.IDRol))
        .filter((id) => Number.isFinite(id));

      if (!roleIdsForCloseVersion.length) {
        setCanCloseVersion(false);
        return;
      }

      const rolesUsuarioFilter = `IDExpediente eq ${idExpedienteNum} and (${roleIdsForCloseVersion
        .map((id) => `IDRol eq ${id}`)
        .join(" or ")})`;

      const rolesRaw: any[] = await sp.web.lists
        .getByTitle("Roles_usuario")
        .items.filter(rolesUsuarioFilter)
        .select("Title", "IDRol", "usuario")
        .top(5000)
        .getAll();

      const tryGetEmail = (role: any): string => {
        const userField = role?.usuario;
        if (!userField) return "";
        if (typeof userField === "string") {
          const str = userField.trim();
          if (str.includes("@")) return str;
        }
        return "";
      };

      const isTecnico = rolesRaw.some((r) => {
        const titleNorm = normalizeText(r?.Title || "");
        const emailNorm = normalizeText(tryGetEmail(r));
        return (
          (currentUserNameNorm && titleNorm === currentUserNameNorm) ||
          (currentUserEmailNorm && emailNorm === currentUserEmailNorm)
        );
      });

      setCanCloseVersion(isTecnico);
    } catch (e) {
      console.error("Error validando permisos cerrar versión:", e);
      setCanCloseVersion(false);
    } finally {
      setIsLoadingCloseVersionPerm(false);
    }
  };

  React.useEffect(() => {
    if (!task || !idProyecto) return;
    void checkCloseVersionPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, idProyecto]);

  React.useEffect(() => {
    let cancelled = false;

    const loadAssignedDocumentTitulo = async (): Promise<void> => {
      const isArchived =
        task?.estado === "Versionado" || task?.estado === "Fin";
      const rawUrl = isArchived
        ? String(archivedPrincipalFileRef || "").trim()
        : String(selectedFolderUrlSaved || "").trim();
      const fileUrl = resolveServerRelativeDocumentUrl(
        rawUrl,
        webServerRelativePath,
      );
      if (!fileUrl) {
        if (!cancelled) {
          setAssignedDocumentTitulo("");
        }
        return;
      }

      try {
        const fileItem: any = await sp.web
          .getFileByServerRelativeUrl(fileUrl)
          .getItem();
        const titulo = String(fileItem?.TituloDocumento || "").trim();
        const idRaw = Number(fileItem?.IDDocumento);
        const idDocumento =
          Number.isFinite(idRaw) && idRaw > 0 ? idRaw : undefined;
        if (!cancelled) {
          setAssignedDocumentTitulo(titulo);
          if (idDocumento !== undefined) {
            setAssignedDocumentId(idDocumento);
          }
        }
      } catch (e) {
        console.warn(
          "No se pudo leer TituloDocumento del documento asignado:",
          e,
        );
        if (!cancelled) {
          setAssignedDocumentTitulo("");
        }
      }
    };

    void loadAssignedDocumentTitulo();
    return () => {
      cancelled = true;
    };
  }, [
    task?.estado,
    selectedFolderUrlSaved,
    archivedPrincipalFileRef,
    webServerRelativePath,
  ]);

  const checkEditPermission = async () => {
    try {
      if (!idProyecto) {
        setCanEditTask(false);
        return;
      }

      const currentUserNameNorm = normalizeText(
        context.pageContext.user.displayName || "",
      );
      const currentUserEmailNorm = normalizeText(
        context.pageContext.user.email || "",
      );

      const idExpedienteNum =
        typeof idProyecto === "number"
          ? idProyecto
          : parseInt(String(idProyecto), 10);
      if (!idExpedienteNum || Number.isNaN(idExpedienteNum)) {
        setCanEditTask(false);
        return;
      }

      const rolesRaw: any[] = await sp.web.lists
        .getByTitle("Roles_usuario")
        .items.filter(`IDExpediente eq ${idExpedienteNum}`)
        .select("Title", "usuario")
        .top(5000)
        .getAll();

      const hasPermissionByRole = rolesRaw.some((r) => {
        const titleNorm = normalizeText(r?.Title || "");
        const usuarioNorm = normalizeText(String(r?.usuario || ""));
        return (
          (currentUserNameNorm && titleNorm === currentUserNameNorm) ||
          (currentUserEmailNorm &&
            usuarioNorm.indexOf(currentUserEmailNorm) >= 0)
        );
      });

      const currentUserGroups: Array<{ Title?: string }> =
        await sp.web.currentUser.groups.select("Title").get();
      const hasPermissionByGroup = currentUserGroups.some((group) => {
        const normalizedGroupName = normalizeText(group.Title || "");
        return (
          normalizedGroupName === "calidad" ||
          normalizedGroupName === "documentacion" ||
          normalizedGroupName.indexOf("calidad") >= 0 ||
          normalizedGroupName.indexOf("documentacion") >= 0
        );
      });

      setCanEditTask(hasPermissionByRole || hasPermissionByGroup);
    } catch (e) {
      console.error("Error validando permisos de edición:", e);
      setCanEditTask(false);
    }
  };

  React.useEffect(() => {
    if (!idProyecto) {
      setCanEditTask(false);
      return;
    }
    void checkEditPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idProyecto]);

  const handleCerrarVersion = async () => {
    if (!taskId) return;
    const tareaNum = parseInt(taskId, 10);
    if (Number.isNaN(tareaNum)) return;

    setCloseVersionError(null);

    // Idempotencia: si la tarea ya está cerrada, no repetir el proceso.
    const estadoActualNorm = normalizeText(String(task?.estado || ""));
    if (estadoActualNorm === "fin" || estadoActualNorm === "versionado") {
      setShowConfirmCerrarVersionDialog(false);
      setShowCerrarVersionModal(false);
      setCloseCustomNames({});
      setCloseVersionSelectedFiles([]);
      setRequiredTaskDocFileUrl(null);
      setRequiredTaskDocFileName("");
      setTaskUpdateSuccess("La versión ya estaba cerrada.");
      await loadTask();
      return;
    }

    if (
      task?.numeroDocumento === null ||
      task?.numeroDocumento === undefined ||
      Number.isNaN(Number(task.numeroDocumento))
    ) {
      setCloseVersionError("La tarea no tiene número de documento asignado.");
      return;
    }
    if (
      task?.versionDocumento === null ||
      task?.versionDocumento === undefined ||
      Number.isNaN(Number(task.versionDocumento))
    ) {
      setCloseVersionError("La tarea no tiene versión de documento asignada.");
      return;
    }

    if (!closeVersionSelectedFiles.length) {
      setCloseVersionError(
        "Debes seleccionar al menos un fichero para cerrar la versión.",
      );
      return;
    }
    if (
      requiredTaskDocFileUrl &&
      !closeVersionSelectedFiles.includes(requiredTaskDocFileUrl)
    ) {
      setCloseVersionError(
        `El documento asociado a la tarea${requiredTaskDocFileName ? ` (${requiredTaskDocFileName})` : ""} es obligatorio y debe mantenerse seleccionado.`,
      );
      return;
    }

    const usesPatternNomenclatura = task?.patronNomenclaturaId === 1;
    if (!usesPatternNomenclatura) {
      const missingName = closeVersionSelectedFiles.find((url) => {
        const custom = String(closeCustomNames[url] || "").trim();
        return !custom;
      });
      if (missingName) {
        setCloseVersionError(
          "Debes indicar el nombre definitivo para todos los ficheros seleccionados.",
        );
        return;
      }
    }

    try {
      setIsClosingVersion(true);

      // Comprobación temprana en SharePoint (otra pestaña puede haber cerrado ya).
      {
        const earlyItems: any[] = await sp.web.lists
          .getByTitle("TareasDocumentales")
          .items.filter(`IDTarea eq ${tareaNum}`)
          .select("EstadoTarea", "Estado", "EstadoArchivado")
          .top(1)
          .get();
        if (earlyItems.length) {
          const earlyEstado = normalizeText(
            String(earlyItems[0]?.EstadoTarea || earlyItems[0]?.Estado || ""),
          );
          const earlyArchivado = normalizeText(
            String(earlyItems[0]?.EstadoArchivado || ""),
          );
          if (
            earlyEstado === "fin" ||
            earlyEstado === "versionado" ||
            earlyArchivado === "pendiente"
          ) {
            setShowConfirmCerrarVersionDialog(false);
            setShowCerrarVersionModal(false);
            setCloseCustomNames({});
            setCloseVersionSelectedFiles([]);
            setRequiredTaskDocFileUrl(null);
            setRequiredTaskDocFileName("");
            setTaskUpdateSuccess(
              "La versión ya estaba cerrada. No se ha vuelto a actualizar la tarea.",
            );
            await loadTask();
            return;
          }
        }
      }

      const version = String(task.versionDocumento);
      const aa = String(task.numeroDocumento);
      const idExpedienteNum =
        typeof idProyecto === "number"
          ? idProyecto
          : parseInt(String(idProyecto), 10);
      const webServerRelativeUrl =
        context.pageContext.web.serverRelativeUrl.replace(/\/$/, "");

      const workRoot = `${webServerRelativeUrl}/DocumentacionTrabajo/${idExpedienteNum}`;
      const taskDestinationRaw = String(task?.carpetaDestino || "").trim();
      if (!taskDestinationRaw) {
        setCloseVersionError(
          "La tarea no tiene configurada la carpeta destino (Carpeta).",
        );
        return;
      }

      let tipoAcronimo = "";
      let ordinalE2E = "";
      if (
        usesPatternNomenclatura &&
        task?.idTipo !== null &&
        task?.idTipo !== undefined
      ) {
        try {
          const tipos: any[] = await sp.web.lists
            .getByTitle("TiposDocumentacion")
            .items.filter(`IDTipoDocumento eq ${task.idTipo} and Activo eq 1`)
            .select("Acronimo")
            .top(1)
            .get();
          tipoAcronimo = String(tipos[0]?.Acronimo || "").trim();
        } catch {
          tipoAcronimo = "";
        }

        try {
          const expItems: any[] = await sp.web.lists
            .getByTitle("Expedientes")
            .items.filter(`IDExpediente eq ${idExpedienteNum}`)
            .select("OrdinalE2E")
            .top(1)
            .get();
          ordinalE2E = String(expItems[0]?.OrdinalE2E || "").trim();
        } catch {
          ordinalE2E = "";
        }
      }

      let idDocumentoPrincipal: number | undefined;
      const principalDocUrl =
        requiredTaskDocFileUrl &&
        closeVersionSelectedFiles.includes(requiredTaskDocFileUrl)
          ? requiredTaskDocFileUrl
          : closeVersionSelectedFiles[0];
      const sourceFileUrlsToClose = [...closeVersionSelectedFiles];
      if (principalDocUrl) {
        try {
          const principalDocItem = await sp.web
            .getFileByServerRelativeUrl(principalDocUrl)
            .getItem();
          const principalIdDocumentoRaw = principalDocItem?.IDDocumento;
          const principalIdDocumentoNum =
            principalIdDocumentoRaw !== null &&
            principalIdDocumentoRaw !== undefined &&
            !Number.isNaN(Number(principalIdDocumentoRaw))
              ? Number(principalIdDocumentoRaw)
              : undefined;
          if (principalIdDocumentoNum !== undefined) {
            idDocumentoPrincipal = principalIdDocumentoNum;
          }
        } catch (idDocErr) {
          console.error(
            "No se pudo leer el IDDocumento del documento principal:",
            idDocErr,
          );
        }
      }

      // Resolver IDDocumento antes de localizar el PDF convertido.
      if (idDocumentoPrincipal === undefined && requiredTaskDocFileUrl) {
        try {
          const principalDocs: any[] = await sp.web.lists
            .getByTitle("DocumentoPrincipal")
            .items.filter(`IDTarea eq ${tareaNum}`)
            .select("IDDocumento")
            .top(1)
            .get();
          const idDocRaw = principalDocs[0]?.IDDocumento;
          if (
            idDocRaw !== null &&
            idDocRaw !== undefined &&
            !Number.isNaN(Number(idDocRaw))
          ) {
            idDocumentoPrincipal = Number(idDocRaw);
          }
        } catch {
          // Sin IDDocumento no se puede localizar el PDF asociado.
        }
      }

      // Documento obligatorio: DOCX + PDF convertido (mismo IDDocumento).
      let mandatoryOriginalBase = "";
      const mandatoryPdfUrls = new Set<string>();
      const mandatoryTaskDocumentUrls = new Set<string>();
      if (requiredTaskDocFileUrl) {
        const requiredUrl = resolveServerRelativeDocumentUrl(
          String(requiredTaskDocFileUrl).trim(),
          webServerRelativePath,
        );
        if (requiredUrl) {
          mandatoryTaskDocumentUrls.add(requiredUrl);
        }
        const requiredFileName = requiredUrl.split("/").pop() || "";
        const requiredDot = requiredFileName.lastIndexOf(".");
        mandatoryOriginalBase =
          requiredDot > 0
            ? requiredFileName.substring(0, requiredDot)
            : requiredFileName;
        // Sin patrón: el PDF asociado sigue el nombre definitivo indicado para el docx.
        if (!usesPatternNomenclatura) {
          const requiredCustomBase = getFileBaseName(
            closeCustomNames[requiredTaskDocFileUrl] ||
              closeCustomNames[requiredUrl] ||
              "",
          );
          if (requiredCustomBase) {
            mandatoryOriginalBase = requiredCustomBase;
          }
        }
        const requiredExt =
          requiredDot > 0
            ? requiredFileName.substring(requiredDot).toLowerCase()
            : "";

        if (requiredExt === ".pdf") {
          if (requiredUrl) mandatoryPdfUrls.add(requiredUrl);
        } else if (
          requiredExt === ".docx" &&
          idDocumentoPrincipal !== undefined
        ) {
          // Buscar PDF por IDDocumento (pueden coexistir DOCX y PDF).
          const companionUrl = await findCompanionPdfByIdDocumento(
            idDocumentoPrincipal,
            webServerRelativePath,
          );
          if (companionUrl) {
            mandatoryPdfUrls.add(companionUrl);
            if (sourceFileUrlsToClose.includes(companionUrl)) {
              mandatoryTaskDocumentUrls.add(companionUrl);
            } else {
              sourceFileUrlsToClose.push(companionUrl);
              mandatoryTaskDocumentUrls.add(companionUrl);
            }
          }
        }
      }

      // Payload para el flujo: no se copia a DocumentacionArchivo desde el front.
      const documentosCierre: Array<{
        itemId: number;
        serverRelativeUrl: string;
        nombreDestino: string;
        idDocumento: number | null;
      }> = [];

      for (const sourceFileUrl of sourceFileUrlsToClose) {
        if (!sourceFileUrl || !sourceFileUrl.startsWith(workRoot)) continue;

        const resolvedSourceUrl =
          resolveServerRelativeDocumentUrl(
            sourceFileUrl,
            webServerRelativePath,
          ) || sourceFileUrl;

        const rel = resolvedSourceUrl.replace(workRoot, "").replace(/^\/+/, "");
        const parts = rel.split("/");
        const fileName = parts.pop() || "";
        if (!fileName) continue;

        const dotIndex = fileName.lastIndexOf(".");
        const ext = dotIndex > 0 ? fileName.substring(dotIndex) : "";
        const isMandatoryPdfCopy =
          ext.toLowerCase() === ".pdf" &&
          mandatoryPdfUrls.has(sourceFileUrl) &&
          idDocumentoPrincipal !== undefined;

        const decodedFileName = (() => {
          try {
            return decodeURIComponent(fileName.replace(/\+/g, " "));
          } catch {
            return fileName;
          }
        })();
        const customNameRaw = String(
          closeCustomNames[sourceFileUrl] ||
            closeCustomNames[resolvedSourceUrl] ||
            "",
        ).trim();
        const destFileName = buildCloseVersionDestFileName({
          fileName: decodedFileName,
          version,
          aa,
          usesPatternNomenclatura,
          tipoAcronimo,
          ordinalE2E,
          customName: customNameRaw,
          isMandatoryPdf: !!isMandatoryPdfCopy,
          mandatoryOriginalBase,
          idDocumento: idDocumentoPrincipal,
        });

        const sourceFileItem = await sp.web
          .getFileByServerRelativeUrl(resolvedSourceUrl)
          .getItem();
        const itemIdRaw = sourceFileItem?.Id ?? sourceFileItem?.ID;
        const itemId = Number(itemIdRaw);
        if (!Number.isFinite(itemId) || itemId <= 0) {
          throw new Error(
            `No se pudo obtener el Id del fichero en DocumentacionTrabajo: ${decodedFileName}`,
          );
        }

        const isRequiredTaskDocument =
          idDocumentoPrincipal !== undefined &&
          (mandatoryTaskDocumentUrls.has(sourceFileUrl) ||
            mandatoryTaskDocumentUrls.has(resolvedSourceUrl));

        let idDocumento: number | null = null;
        if (isRequiredTaskDocument && idDocumentoPrincipal !== undefined) {
          idDocumento = idDocumentoPrincipal;
        } else {
          const idDocRaw = sourceFileItem?.IDDocumento;
          if (
            idDocRaw !== null &&
            idDocRaw !== undefined &&
            !Number.isNaN(Number(idDocRaw))
          ) {
            idDocumento = Number(idDocRaw);
          }
        }

        documentosCierre.push({
          itemId,
          serverRelativeUrl: resolvedSourceUrl,
          nombreDestino: destFileName,
          idDocumento,
        });
      }

      if (!documentosCierre.length) {
        throw new Error(
          "No se pudo preparar ningún documento para el cierre de versión.",
        );
      }

      // Releer estado justo antes de escribir (protección multi-pestaña):
      // si otra pestaña ya cerró, no volver a actualizar (evita re-disparar el flujo).
      const tareasList = sp.web.lists.getByTitle("TareasDocumentales");
      const tareaItems: any[] = await tareasList.items
        .filter(`IDTarea eq ${tareaNum}`)
        .select(
          "ID",
          "FechaFinTarea",
          "EstadoTarea",
          "Estado",
          "EstadoArchivado",
        )
        .top(1)
        .get();
      if (!tareaItems.length) {
        throw new Error("No se encontró la tarea en TareasDocumentales.");
      }

      const estadoTareaNorm = normalizeText(
        String(tareaItems[0]?.EstadoTarea || tareaItems[0]?.Estado || ""),
      );
      const estadoArchivadoNorm = normalizeText(
        String(tareaItems[0]?.EstadoArchivado || ""),
      );
      const alreadyClosed =
        estadoTareaNorm === "fin" ||
        estadoTareaNorm === "versionado" ||
        estadoArchivadoNorm === "pendiente";

      if (alreadyClosed) {
        setShowConfirmCerrarVersionDialog(false);
        setShowCerrarVersionModal(false);
        setCloseCustomNames({});
        setCloseVersionSelectedFiles([]);
        setRequiredTaskDocFileUrl(null);
        setRequiredTaskDocFileName("");
        setTaskUpdateSuccess(
          "La versión ya estaba cerrada. No se ha vuelto a actualizar la tarea.",
        );
        await loadTask();
        return;
      }

      const updateData: Record<string, unknown> = {
        DocumentosCierreJSON: JSON.stringify(documentosCierre),
        EstadoArchivado: "Pendiente",
        EstadoTarea: "Fin",
        Estado: "Fin",
      };

      if (task?.esEntregable) {
        const fechaFinRaw = tareaItems[0]?.FechaFinTarea as string | undefined;
        if (fechaFinRaw) {
          const fechaFinDate = new Date(fechaFinRaw);
          if (!Number.isNaN(fechaFinDate.getTime())) {
            updateData.FechaEntrega = `${toIsoDateOnly(fechaFinDate)}T00:00:00Z`;
          }
        }
      }

      await tareasList.items
        .getById(tareaItems[0].ID as number)
        .update(updateData);

      setShowConfirmCerrarVersionDialog(false);
      setShowCerrarVersionModal(false);
      setCloseCustomNames({});
      setCloseVersionSelectedFiles([]);
      setRequiredTaskDocFileUrl(null);
      setRequiredTaskDocFileName("");
      setTaskUpdateSuccess(
        "Versión cerrada correctamente. El archivado queda pendiente del flujo.",
      );
      await loadTask();
    } catch (e) {
      console.error("Error cerrando versión:", e);
      setCloseVersionError(
        e instanceof Error ? e.message : "No se ha podido cerrar la versión.",
      );
    } finally {
      setIsClosingVersion(false);
    }
  };

  const getRequiredTaskDocumentFile = async (): Promise<{
    fileUrl: string | null;
    fileName: string;
    idDocumento?: number;
  }> => {
    try {
      if (!taskId) return { fileUrl: null, fileName: "" };
      const tareaNum = parseInt(taskId, 10);
      if (Number.isNaN(tareaNum)) return { fileUrl: null, fileName: "" };

      const docs: any[] = await sp.web.lists
        .getByTitle("DocumentoPrincipal")
        .items.filter(`IDTarea eq ${tareaNum}`)
        .select("IDDocumento")
        .top(1)
        .get();
      const idDocumentoRaw = docs[0]?.IDDocumento;
      const idDocumento =
        idDocumentoRaw !== null &&
        idDocumentoRaw !== undefined &&
        !Number.isNaN(Number(idDocumentoRaw))
          ? Number(idDocumentoRaw)
          : undefined;
      if (!idDocumento) return { fileUrl: null, fileName: "" };

      const trabajoItems: any[] = await sp.web.lists
        .getByTitle("DocumentacionTrabajo")
        .items.filter(`IDDocumento eq ${idDocumento}`)
        .select("FileRef", "FileLeafRef")
        .top(20)
        .get();

      if (!trabajoItems.length) return { fileUrl: null, fileName: "" };

      const pickByExt = (ext: string): any | undefined =>
        trabajoItems.find((it) => {
          const leaf = String(it.FileLeafRef || "")
            .trim()
            .toLowerCase();
          return leaf.endsWith(ext);
        });

      // Preferir DOCX como documento principal de la tarea; PDF es el companion.
      const chosen = pickByExt(".docx") || pickByExt(".doc") || trabajoItems[0];
      const leaf =
        (chosen.FileLeafRef as string) ||
        (chosen.FileRef as string)?.split("/").pop() ||
        "";
      return {
        fileUrl: (chosen.FileRef as string) || null,
        fileName: leaf,
        idDocumento,
      };
    } catch (e) {
      console.error("Error obteniendo documento asociado de la tarea:", e);
      return { fileUrl: null, fileName: "" };
    }
  };

  const loadCloseVersionPreviewMeta = async (
    requiredDocUrl: string | null,
    requiredDocId?: number,
  ): Promise<void> => {
    const emptyMeta = {
      tipoAcronimo: "",
      ordinalE2E: "",
      idDocumento: undefined as number | undefined,
      nombreDocumento: "",
      companionPdfUrl: null as string | null,
    };
    try {
      if (!task || !idProyecto) {
        setCloseVersionPreviewMeta(emptyMeta);
        return;
      }

      let tipoAcronimo = "";
      let ordinalE2E = "";
      if (
        task.patronNomenclaturaId === 1 &&
        task.idTipo !== null &&
        task.idTipo !== undefined
      ) {
        try {
          const tipos: any[] = await sp.web.lists
            .getByTitle("TiposDocumentacion")
            .items.filter(`IDTipoDocumento eq ${task.idTipo} and Activo eq 1`)
            .select("Acronimo")
            .top(1)
            .get();
          tipoAcronimo = String(tipos[0]?.Acronimo || "").trim();
        } catch {
          tipoAcronimo = "";
        }
        try {
          const idExpedienteNum =
            typeof idProyecto === "number"
              ? idProyecto
              : parseInt(String(idProyecto), 10);
          const expItems: any[] = await sp.web.lists
            .getByTitle("Expedientes")
            .items.filter(`IDExpediente eq ${idExpedienteNum}`)
            .select("OrdinalE2E")
            .top(1)
            .get();
          ordinalE2E = String(expItems[0]?.OrdinalE2E || "").trim();
        } catch {
          ordinalE2E = "";
        }
      }

      let idDocumento = requiredDocId;
      let nombreDocumento = "";
      let companionPdfUrl: string | null = null;
      const requiredUrl = resolveServerRelativeDocumentUrl(
        String(requiredDocUrl || "").trim(),
        webServerRelativePath,
      );

      if (requiredUrl) {
        try {
          const fileItem = await sp.web
            .getFileByServerRelativeUrl(requiredUrl)
            .getItem();
          nombreDocumento = String(fileItem?.NombreDocumento || "").trim();
          const idFromFile = Number(fileItem?.IDDocumento);
          if (
            idDocumento === undefined &&
            Number.isFinite(idFromFile) &&
            idFromFile > 0
          ) {
            idDocumento = idFromFile;
          }
        } catch {
          // sin metadatos del fichero
        }
      }

      if (idDocumento === undefined && taskId) {
        const tareaNum = parseInt(taskId, 10);
        if (!Number.isNaN(tareaNum)) {
          try {
            const docs: any[] = await sp.web.lists
              .getByTitle("DocumentoPrincipal")
              .items.filter(`IDTarea eq ${tareaNum}`)
              .select("IDDocumento")
              .top(1)
              .get();
            const idRaw = Number(docs[0]?.IDDocumento);
            if (Number.isFinite(idRaw) && idRaw > 0) idDocumento = idRaw;
          } catch {
            // ignore
          }
        }
      }

      if (idDocumento !== undefined) {
        const requiredFileName = requiredUrl
          ? requiredUrl.split("/").pop() || ""
          : "";
        const requiredDot = requiredFileName.lastIndexOf(".");
        const requiredExt =
          requiredDot > 0
            ? requiredFileName.substring(requiredDot).toLowerCase()
            : "";
        if (requiredExt === ".pdf" && requiredUrl) {
          companionPdfUrl = requiredUrl;
        } else {
          companionPdfUrl = await findCompanionPdfByIdDocumento(
            idDocumento,
            webServerRelativePath,
          );
        }
      }

      setCloseVersionPreviewMeta({
        tipoAcronimo,
        ordinalE2E,
        idDocumento,
        nombreDocumento,
        companionPdfUrl,
      });
    } catch (e) {
      console.error("Error cargando previsualización de cierre de versión:", e);
      setCloseVersionPreviewMeta(emptyMeta);
    }
  };

  const updateDocumentoPrincipalUrl = async (
    documentUrl: string,
  ): Promise<boolean> => {
    if (!taskId || !documentUrl) return false;
    const tareaNum = parseInt(taskId, 10);
    if (isNaN(tareaNum)) return false;

    try {
      const docList = sp.web.lists.getByTitle("DocumentoPrincipal");
      const existingDocs: any[] = await docList.items
        .filter(`IDTarea eq ${tareaNum}`)
        .select("ID")
        .top(5)
        .get();

      if (!existingDocs.length) return true;

      for (const docItem of existingDocs) {
        if (!docItem.ID) continue;
        await docList.items
          .getById(docItem.ID as number)
          .update({ UrlDocumento: documentUrl });
      }
      return true;
    } catch (e) {
      console.error("Error actualizando UrlDocumento en DocumentoPrincipal:", e);
      return false;
    }
  };

  const persistTaskDocumentUrl = async (
    documentUrl: string,
    options?: { applyTaskNumeroVersion?: boolean },
  ): Promise<boolean> => {
    if (!taskId || !documentUrl) return false;
    const tareaNum = parseInt(taskId, 10);
    if (isNaN(tareaNum)) {
      setError("ID de tarea no válido.");
      return false;
    }

    try {
      const docList = sp.web.lists.getByTitle("DocumentoPrincipal");
      const existingDocs: any[] = await docList.items
        .filter(`IDTarea eq ${tareaNum}`)
        .select("ID", "IDDocumento")
        .top(5)
        .get();

      const urlUpdated = await updateDocumentoPrincipalUrl(documentUrl);
      if (!urlUpdated) return false;

      try {
        const fileItem = await sp.web
          .getFileByServerRelativeUrl(documentUrl)
          .getItem();

        const primeraDocPrincipal = existingDocs[0];
        const idDocumento = primeraDocPrincipal?.IDDocumento as
          | number
          | undefined;
        const metadataToSet: Record<string, unknown> = {};

        if (idDocumento) {
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

          const titulo =
            metaValueByKey.get("titulo") ||
            metaValueByKey.get("titulodocumento");
          if (titulo) metadataToSet["TituloDocumento"] = titulo;

          const nombre =
            metaValueByKey.get("nombre") ||
            metaValueByKey.get("nombredocumento");
          if (nombre) metadataToSet["NombreDocumento"] = nombre;

          const tipologia =
            metaValueByKey.get("tipologiadocumental") ||
            metaValueByKey.get("tipologia") ||
            metaValueByKey.get("tipologias");
          if (tipologia) metadataToSet["TipologiaDocumental"] = tipologia;

          const numero =
            metaValueByKey.get("numerodocumento") ||
            metaValueByKey.get("numero");
          if (numero) metadataToSet["NumeroDocumento"] = parseInt(numero);

          const version =
            metaValueByKey.get("versiondocumento") ||
            metaValueByKey.get("version");
          if (version) metadataToSet["VersionDocumento"] = parseInt(version);

          const ordinal =
            metaValueByKey.get("ordinalede2e") ||
            metaValueByKey.get("ordinal") ||
            metaValueByKey.get("ordinale2e");
          if (ordinal) metadataToSet["OrdinalE2E"] = parseInt(ordinal);

          if (task?.idTipo !== null && task?.idTipo !== undefined) {
            metadataToSet["IDTipo"] = task.idTipo;
          }

          metadataToSet["IDDocumento"] = idDocumento;
          const idProyectoNum =
            typeof idProyecto === "number"
              ? idProyecto
              : parseInt(String(idProyecto), 10);
          if (!Number.isNaN(idProyectoNum)) {
            metadataToSet["IDExpedienteDocumento"] = idProyectoNum;
            try {
              const expItems: any[] = await sp.web.lists
                .getByTitle("Expedientes")
                .items.filter(`IDExpediente eq ${idProyectoNum}`)
                .select("Nemotecnico", "CodExp")
                .top(1)
                .get();
              const nemotecnico = String(expItems[0]?.Nemotecnico || "").trim();
              const codExp = String(expItems[0]?.CodExp || "").trim();
              if (nemotecnico) {
                metadataToSet["Nemotecnico"] = nemotecnico;
              }
              if (codExp) {
                metadataToSet["CodExp"] = codExp;
              }
            } catch (expErr) {
              console.warn(
                "No se pudo obtener Nemotecnico/CodExp del expediente al asignar documento:",
                expErr,
              );
            }
          }
        }

        if (options?.applyTaskNumeroVersion) {
          if (
            task?.numeroDocumento !== null &&
            task?.numeroDocumento !== undefined &&
            !Number.isNaN(Number(task.numeroDocumento))
          ) {
            metadataToSet["NumeroDocumento"] = Number(task.numeroDocumento);
          }
          if (
            task?.versionDocumento !== null &&
            task?.versionDocumento !== undefined &&
            !Number.isNaN(Number(task.versionDocumento))
          ) {
            metadataToSet["VersionDocumento"] = Number(task.versionDocumento);
          }
        }

        if (Object.keys(metadataToSet).length > 0) {
          await fileItem.update(metadataToSet);
        }
      } catch (metaErr) {
        console.error("Error copiando metadatos al fichero:", metaErr);
        setError(
          "No se ha podido copiar los metadatos del documento seleccionado.",
        );
        return false;
      }

      return true;
    } catch (e) {
      console.error("Error actualizando documento de la tarea:", e);
      setError("No se ha podido actualizar el documento de la tarea.");
      return false;
    }
  };

  const handleSaveSelectedDocument = async () => {
    if (
      savingDocLocationRef.current ||
      savingDocLocation ||
      documentAssignCompletedRef.current ||
      documentAssignCompleted
    ) {
      return;
    }
    if (!selectedFolderUrl) {
      setAssignDocumentError(
        "Debe seleccionar un documento antes de asignarlo a la tarea.",
      );
      return;
    }
    setAssignDocumentError(null);
    if (!taskId) return;
    try {
      savingDocLocationRef.current = true;
      setSavingDocLocation(true);
      const tareaNum = parseInt(taskId, 10);
      if (isNaN(tareaNum)) {
        setError("ID de tarea no válido.");
        return;
      }

      const webSrv = context.pageContext.web.serverRelativeUrl.replace(
        /\/$/,
        "",
      );
      let documentUrlToPersist = resolveServerRelativeDocumentUrl(
        selectedFolderUrl,
        webSrv,
      );
      if (!documentUrlToPersist) {
        setAssignDocumentError(
          "La ruta del documento seleccionado no es válida.",
        );
        return;
      }

      // Prefijo de nombre: ValorMetadato del ítem Title=Titulo en MetadatosDocumentos.
      try {
        const docs: any[] = await sp.web.lists
          .getByTitle("DocumentoPrincipal")
          .items.filter(`IDTarea eq ${tareaNum}`)
          .select("IDDocumento")
          .top(1)
          .get();
        const idDocumentoNum = Number(docs[0]?.IDDocumento);
        if (isFinite(idDocumentoNum) && idDocumentoNum > 0) {
          const metasItems: any[] = await sp.web.lists
            .getByTitle("MetadatosDocumentos")
            .items.filter(`IDDocumento eq ${idDocumentoNum}`)
            .select("Title", "ValorMetadato")
            .top(5000)
            .get();

          const tituloMeta = metasItems.find((m) => {
            const titleNorm = normalizeText(String(m?.Title || ""));
            return titleNorm === "titulo" || titleNorm === "titulodocumento";
          });
          const tituloPrefix = String(tituloMeta?.ValorMetadato || "")
            .trim()
            .replace(/[\\/:*?"<>|#{}%~&]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          if (tituloPrefix) {
            const currentFileNameRaw =
              documentUrlToPersist.split("/").pop() || "";
            let currentFileName = currentFileNameRaw;
            try {
              currentFileName = decodeURIComponent(
                currentFileNameRaw.replace(/\+/g, " "),
              );
            } catch {
              currentFileName = currentFileNameRaw;
            }
            const dot = currentFileName.lastIndexOf(".");
            const currentExt =
              dot > 0 ? currentFileName.substring(dot) : "";
            const newFileName = `${tituloPrefix}${currentExt}`;
            const alreadyNamed =
              currentFileName.toLowerCase() === newFileName.toLowerCase();
            if (currentFileName && !alreadyNamed) {
              const folderUrl = getFolderUrlFromDocumentUrl(documentUrlToPersist);
              const newFileUrl = resolveServerRelativeDocumentUrl(
                `${folderUrl}/${newFileName}`,
                webSrv,
              );
              if (newFileUrl && newFileUrl !== documentUrlToPersist) {
                documentUrlToPersist = await moveFileAvoidingMaxUrlLength(
                  context,
                  documentUrlToPersist,
                  folderUrl,
                  newFileName,
                  true,
                );
                setSelectedFolderUrl(documentUrlToPersist);
              }
            }
          }
        }
      } catch (renameErr) {
        console.error(
          "Error renombrando el documento con prefijo Titulo:",
          renameErr,
        );
        setAssignDocumentError(
          "No se ha podido renombrar el documento con el prefijo de Título.",
        );
        return;
      }

      const persisted = await persistTaskDocumentUrl(documentUrlToPersist, {
        applyTaskNumeroVersion: true,
      });
      if (!persisted) return;

      // Cambiar estado de la tarea a Borrador en TareasDocumentales
      const tareasList = sp.web.lists.getByTitle("TareasDocumentales");
      const tareaItems: any[] = await tareasList.items
        .filter(`IDTarea eq ${tareaNum}`)
        .select("ID")
        .top(1)
        .get();

      if (tareaItems.length) {
        const aprobadoresCount = (task?.aprobadores || []).filter(
          (a) => !!String(a?.usuario?.nombre || "").trim(),
        ).length;
        const firmantesCount = (task?.firmantes || []).filter(
          (f) => !!String(f?.usuario?.nombre || "").trim(),
        ).length;
        const nextEstado: ITaskDetail["estado"] =
          aprobadoresCount === 0 && firmantesCount === 0
            ? "Aprobado"
            : "Borrador";

        await tareasList.items.getById(tareaItems[0].ID as number).update({
          EstadoTarea: nextEstado,
          Estado: nextEstado,
        });
        setTask((prev) => (prev ? { ...prev, estado: nextEstado } : prev));
      }

      documentAssignCompletedRef.current = true;
      setDocumentAssignCompleted(true);
      await loadTask();
    } catch (e) {
      console.error("Error guardando ubicación de documento:", e);
      setError(
        "No se ha podido guardar la ubicación del documento seleccionado.",
      );
    } finally {
      if (!documentAssignCompletedRef.current) {
        savingDocLocationRef.current = false;
        setSavingDocLocation(false);
      }
    }
  };

  const registerFirmaCompletion = async (firmaId: number): Promise<void> => {
    if (!taskId) return;
    const tareaNum = parseInt(taskId, 10);
    if (isNaN(tareaNum)) return;

    const firmasList = sp.web.lists.getByTitle("Firmas");
    await firmasList.items.getById(firmaId).update({
      EstadoFirma: "Aprobado",
      FechaFirma: new Date().toISOString(),
    });

    const firmasPendientes: any[] = await firmasList.items
      .filter(
        `IDTareaDocumental eq ${tareaNum} and EstadoFirma eq 'Pendiente'`,
      )
      .select("ID")
      .top(5000)
      .getAll();

    if (!firmasPendientes.length) {
      const tareasList = sp.web.lists.getByTitle("TareasDocumentales");
      const tareaItems: any[] = await tareasList.items
        .filter(`IDTarea eq ${tareaNum}`)
        .select("ID")
        .top(1)
        .get();

      if (tareaItems.length) {
        await tareasList.items.getById(tareaItems[0].ID as number).update({
          EstadoTarea: "Aprobado",
          Estado: "Aprobado",
        });
      }
    }

    setTaskUpdateSuccess("Firma registrada correctamente.");
    setFirmanteSignedLocalFile(null);
    setShowConfirmFirmaDialog(false);
    await loadTask();
  };

  const handleFirmar = async (firmaId: number) => {
    try {
      setIsSubmittingFirma(true);
      setTaskUpdateSuccess(null);
      await registerFirmaCompletion(firmaId);
    } catch (e) {
      console.error("Error registrando firma:", e);
      setError("No se ha podido registrar tu firma.");
    } finally {
      setIsSubmittingFirma(false);
    }
  };

  const handleConfirmFirma = async (): Promise<void> => {
    const pendingFirma = firmas.find((f) => {
      const idFirmanteNorm = normalizeText(f.idFirmante || "");
      const titleNorm = normalizeText(f.title || "");
      const isCurrentUser =
        (normalizeText(context.pageContext.user.email || "") &&
          idFirmanteNorm ===
            normalizeText(context.pageContext.user.email || "")) ||
        (normalizeText(context.pageContext.user.displayName || "") &&
          titleNorm === normalizeText(context.pageContext.user.displayName || ""));
      return (
        isCurrentUser &&
        normalizeText(f.estadoFirma || "") === "pendiente"
      );
    });

    if (!pendingFirma) return;
    if (!firmanteSignedLocalFile) {
      setFirmanteDocumentError(
        "Debe seleccionar el documento firmado desde su ordenador.",
      );
      return;
    }
    if (!assignedDocumentServerRelative) {
      setFirmanteDocumentError(
        "No hay documento asignado a la tarea para reemplazar.",
      );
      return;
    }

    setFirmanteDocumentError(null);

    try {
      setIsSubmittingFirma(true);
      setTaskUpdateSuccess(null);

      const newFileUrl = await replaceTaskDocumentFile(
        context,
        assignedDocumentServerRelative,
        firmanteSignedLocalFile,
      );

      const uploadedLeaf = String(firmanteSignedLocalFile.name || "").trim();
      const uploadedDot = uploadedLeaf.lastIndexOf(".");
      const tituloFromUpload = (
        uploadedDot > 0 ? uploadedLeaf.substring(0, uploadedDot) : uploadedLeaf
      ).trim();
      try {
        const replacedItem = await sp.web
          .getFileByServerRelativeUrl(newFileUrl)
          .getItem();
        const metadataAfterSign: Record<string, unknown> = {};
        if (tituloFromUpload) {
          metadataAfterSign.TituloDocumento = tituloFromUpload;
        }

        const idProyectoNum =
          typeof idProyecto === "number"
            ? idProyecto
            : parseInt(String(idProyecto), 10);
        if (!Number.isNaN(idProyectoNum) && idProyectoNum > 0) {
          try {
            const expItems: any[] = await sp.web.lists
              .getByTitle("Expedientes")
              .items.filter(`IDExpediente eq ${idProyectoNum}`)
              .select("Nemotecnico", "CodExp")
              .top(1)
              .get();
            const nemotecnico = String(expItems[0]?.Nemotecnico || "").trim();
            const codExp = String(expItems[0]?.CodExp || "").trim();
            if (nemotecnico) metadataAfterSign.Nemotecnico = nemotecnico;
            if (codExp) metadataAfterSign.CodExp = codExp;
          } catch (expErr) {
            console.warn(
              "Documento firmado subido, pero no se pudo obtener Nemotecnico/CodExp del expediente:",
              expErr,
            );
          }
        }

        if (Object.keys(metadataAfterSign).length > 0) {
          await replacedItem.update(metadataAfterSign);
        }
        if (tituloFromUpload) {
          setAssignedDocumentTitulo(tituloFromUpload);
        }
      } catch (tituloErr) {
        console.warn(
          "Documento firmado subido, pero no se pudo actualizar metadatos del fichero:",
          tituloErr,
        );
      }

      const urlUpdated = await updateDocumentoPrincipalUrl(newFileUrl);
      if (!urlUpdated) {
        setFirmanteDocumentError(
          "El documento se subió, pero no se pudo actualizar la ruta en DocumentoPrincipal.",
        );
        return;
      }
      setSelectedFolderUrlSaved(newFileUrl);

      await registerFirmaCompletion(pendingFirma.id);
    } catch (e) {
      console.error("Error confirmando firma:", e);
      setFirmanteDocumentError(
        "No se ha podido subir el documento firmado ni confirmar la firma.",
      );
    } finally {
      setIsSubmittingFirma(false);
    }
  };

  const handleResolverRevision = async (
    nuevoEstado: "Aprobado" | "Rechazado",
    revisionId: number,
  ) => {
    try {
      setIsSubmittingRevision(true);
      setTaskUpdateSuccess(null);
      const revisionesList = sp.web.lists.getByTitle("Revisiones");
      await revisionesList.items.getById(revisionId).update({
        EstadoRevision: nuevoEstado,
        Comentario: revisionComment || "",
        FechaRevision: new Date().toISOString(),
      });

      // Si se aprueba una revisión, comprobar si ya no quedan pendientes
      // para avanzar automáticamente el estado de la tarea.
      if (nuevoEstado === "Aprobado" && taskId) {
        const tareaNum = parseInt(taskId, 10);
        if (!isNaN(tareaNum)) {
          const revisionesRestantes: any[] = await revisionesList.items
            .filter(`IDTareaDocumental eq ${tareaNum}`)
            .select("EstadoRevision")
            .top(5000)
            .getAll();

          const hasPendientes = revisionesRestantes.some(
            (r) =>
              normalizeText((r.EstadoRevision as string) || "") === "pendiente",
          );

          if (!hasPendientes) {
            const tareasList = sp.web.lists.getByTitle("TareasDocumentales");
            const tareaItems: any[] = await tareasList.items
              .filter(`IDTarea eq ${tareaNum}`)
              .select("ID")
              .top(1)
              .get();

            if (tareaItems.length) {
              const nextStatus =
                task && task.firmantes && task.firmantes.length > 0
                  ? "PendienteFirma"
                  : "Aprobado";
              await tareasList.items
                .getById(tareaItems[0].ID as number)
                .update({
                  EstadoTarea: nextStatus,
                  Estado: nextStatus,
                });
            }
          }
        }
      }

      // Si se rechaza, la tarea vuelve a Borrador.
      if (nuevoEstado === "Rechazado" && taskId) {
        const tareaNum = parseInt(taskId, 10);
        if (!isNaN(tareaNum)) {
          const tareasList = sp.web.lists.getByTitle("TareasDocumentales");
          const tareaItems: any[] = await tareasList.items
            .filter(`IDTarea eq ${tareaNum}`)
            .select("ID")
            .top(1)
            .get();

          if (tareaItems.length) {
            await tareasList.items.getById(tareaItems[0].ID as number).update({
              EstadoTarea: "Borrador",
              Estado: "Borrador",
            });
          }
        }
      }

      setTaskUpdateSuccess("La revisión se ha actualizado exitosamente.");
      setRevisionComment("");
      await loadTask();
    } catch (e) {
      console.error("Error actualizando revisión:", e);
      setError("No se ha podido actualizar la revisión.");
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  if (error) {
    return (
      <div className={styles.wrapper}>
        <p>{error}</p>
      </div>
    );
  }

  if (!task) {
    return <Loading message="Cargando detalle de la tarea..." />;
  }

  // const currentUserName = "SERGIO GUTIERREZ CANO" || "";
  const currentUserName = context.pageContext.user.displayName || "";
  const currentUserEmail = context.pageContext.user.email || "";
  // const currentUserEmail = "sergio.gutierrezcano@telefonica.com" || "";
  const currentUserNameNorm = normalizeText(currentUserName);
  // const currentUserNameNorm = normalizeText("Director Contrato Marco");
  // const currentUserNameNorm = normalizeText("Preventa 1");
  const currentUserEmailNorm = normalizeText(currentUserEmail);
  // const currentUserEmailNorm = normalizeText("jefe.proyecto1@empresa.com");
  // const currentUserEmailNorm = normalizeText("preventa1@empresa.com");
  const webServerRelativeUrl =
    context.pageContext.web.serverRelativeUrl.replace(/\/$/, "");
  const archiveRootServerRelative = resolveArchiveRootServerRelative(
    task.carpetaDestino || "",
    webServerRelativeUrl,
  );
  const isArchivedTaskState =
    task.estado === "Versionado" || task.estado === "Fin";
  const estadoArchivadoPendiente =
    normalizeText(String(task.estadoArchivado || "")) === "pendiente";
  const showArchiveCopyNotice =
    isArchivedTaskState &&
    estadoArchivadoPendiente &&
    (isCheckingArchiveCopy || !archiveCopyReady);

  const openLocationServerRelative = isArchivedTaskState
    ? archiveRootServerRelative ||
      (archivedPrincipalFileRef
        ? getFolderUrlFromDocumentUrl(archivedPrincipalFileRef)
        : "")
    : selectedFolderUrlSaved
      ? getFolderUrlFromDocumentUrl(selectedFolderUrlSaved)
      : "";
  const openLocationUrl = serverRelativeToOpenUrl(
    openLocationServerRelative,
    absolutePath,
  );

  const assignedDocumentServerRelativeRaw = isArchivedTaskState
    ? String(archivedPrincipalFileRef || "").trim()
    : String(selectedFolderUrlSaved || "").trim();
  const assignedDocumentServerRelative = resolveServerRelativeDocumentUrl(
    assignedDocumentServerRelativeRaw,
    webServerRelativePath,
  );
  const assignedDocumentFileName =
    assignedDocumentServerRelative.split("/").pop() ||
    assignedDocumentServerRelative ||
    "";
  const assignedDocumentOpenUrl = serverRelativeToOpenUrl(
    assignedDocumentServerRelative,
    absolutePath,
  );
  let assignedDocumentLinkLabel = assignedDocumentFileName;
  try {
    assignedDocumentLinkLabel = decodeURIComponent(
      assignedDocumentFileName.replace(/\+/g, " "),
    );
  } catch {
    assignedDocumentLinkLabel = assignedDocumentFileName;
  }
  const assignedDocumentExt = (() => {
    const leaf = String(assignedDocumentLinkLabel || "").trim();
    const dot = leaf.lastIndexOf(".");
    if (dot <= 0) return "";
    return leaf.substring(dot + 1).trim().toUpperCase();
  })();
  const assignedDocumentDisplayName =
    String(assignedDocumentTitulo || "").trim() || assignedDocumentLinkLabel;
  /** Paso 1 firma: TituloDocumento + extensión del fichero real. */
  const assignedDocumentSigningLabel = (() => {
    const titulo = String(assignedDocumentTitulo || "").trim();
    if (!titulo) return assignedDocumentLinkLabel;
    const leaf = String(assignedDocumentLinkLabel || "").trim();
    const dot = leaf.lastIndexOf(".");
    const ext = dot > 0 ? leaf.substring(dot) : "";
    return `${titulo}${ext}`;
  })();
  const assignedDocumentDownloadFileName =
    assignedDocumentExt === "PDF"
      ? stripIdDocumentoFromFileName(
          assignedDocumentLinkLabel,
          assignedDocumentId,
        )
      : assignedDocumentLinkLabel;

  const handleDownloadAssignedDocument = async (
    event: React.MouseEvent<HTMLAnchorElement>,
  ): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (!assignedDocumentServerRelative || isDownloadingAssignedDoc) return;
    try {
      setIsDownloadingAssignedDoc(true);
      const buffer = await sp.web
        .getFileByServerRelativeUrl(assignedDocumentServerRelative)
        .getBuffer();
      // octet-stream: si se usa application/pdf el navegador abre el blob en pestaña
      // y ignora el atributo download.
      const blob = new Blob([buffer], {
        type: "application/octet-stream",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        assignedDocumentDownloadFileName ||
        assignedDocumentLinkLabel ||
        "documento";
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(objectUrl);
      }, 0);
    } catch (e) {
      console.error("Error descargando el documento asignado:", e);
      window.alert("No se ha podido descargar el documento asignado.");
    } finally {
      setIsDownloadingAssignedDoc(false);
    }
  };

  const projectDetailUrl = idProyecto
    ? `${absolutePath}/SitePages/detalle-proyecto.aspx?proyectoid=${encodeURIComponent(
        String(idProyecto),
      )}&tab=expedientes`
    : "";
  const carpetaDestinoDisplay = getRelativePathAfterProjectId(
    task.carpetaDestino || "",
    idProyecto,
  );
  const prefijoCierreVersion = buildCloseVersionNamePrefix({
    usesPatternNomenclatura: task.patronNomenclaturaId === 1,
    tipoAcronimo: task.acronimo,
    ordinalE2E: task.ordinalE2E,
    numeroDocumento: task.numeroDocumento,
    versionDocumento: task.versionDocumento,
  });
  const isDeadlineExpired = isPastDisplayDate(task.fechaDeadline);
  const elaboradores = String(task.elaborador || "")
    .split(",")
    .map((n) => normalizeText(n))
    .filter(Boolean);
  const isCurrentUserElaborador =
    elaboradores.includes(currentUserNameNorm) ||
    (!!currentUserEmailNorm && elaboradores.includes(currentUserEmailNorm));
  const revisionesPendientes = revisiones.filter(
    (r) => normalizeText(r.estadoRevision || "") === "pendiente",
  );
  const revisionPendienteUsuario =
    revisionesPendientes.find((r) => {
      const idRevisorNorm = normalizeText(r.idRevisor || "");
      const titleNorm = normalizeText(r.title || "");
      return (
        (currentUserEmailNorm && idRevisorNorm === currentUserEmailNorm) ||
        (currentUserNameNorm && titleNorm === currentUserNameNorm)
      );
    }) || null;

  const firmaParaUsuario = firmas.find((f) => {
    const idFirmanteNorm = normalizeText(f.idFirmante || "");
    const titleNorm = normalizeText(f.title || "");
    return (
      (currentUserEmailNorm && idFirmanteNorm === currentUserEmailNorm) ||
      (currentUserNameNorm && titleNorm === currentUserNameNorm)
    );
  });

  const firmaPendienteParaUsuario =
    firmaParaUsuario &&
    normalizeText(firmaParaUsuario.estadoFirma || "") === "pendiente"
      ? firmaParaUsuario
      : null;

  const closeVersionNamePreviews = (() => {
    if (!showCerrarVersionModal) return [];
    const usesPatternNomenclatura = task.patronNomenclaturaId === 1;
    const version = String(task.versionDocumento ?? "");
    const aa = String(task.numeroDocumento ?? "");
    const requiredUrl = resolveServerRelativeDocumentUrl(
      String(requiredTaskDocFileUrl || "").trim(),
      webServerRelativePath,
    );
    const requiredFileName = (() => {
      try {
        return decodeURIComponent(
          (requiredUrl.split("/").pop() || "").replace(/\+/g, " "),
        );
      } catch {
        return requiredUrl.split("/").pop() || "";
      }
    })();
    const mandatoryOriginalBase = getFileBaseName(requiredFileName);
    // Sin patrón: el PDF usa la base del nombre definitivo del documento obligatorio.
    const requiredCustomBase = getFileBaseName(
      closeCustomNames[requiredTaskDocFileUrl || ""] ||
        closeCustomNames[requiredUrl] ||
        "",
    );
    const mandatoryPdfBase = String(
      (!usesPatternNomenclatura && requiredCustomBase) ||
        mandatoryOriginalBase ||
        "",
    ).trim();

    const urlsForPreview = [...closeVersionSelectedFiles];
    const companionPdfUrl = closeVersionPreviewMeta.companionPdfUrl;
    if (
      companionPdfUrl &&
      urlsForPreview.indexOf(companionPdfUrl) < 0 &&
      !urlsForPreview.some(
        (u) =>
          resolveServerRelativeDocumentUrl(u, webServerRelativePath) ===
          companionPdfUrl,
      )
    ) {
      urlsForPreview.push(companionPdfUrl);
    }

    return urlsForPreview.map((fileUrl) => {
      const normalizedUrl = resolveServerRelativeDocumentUrl(
        fileUrl,
        webServerRelativePath,
      );
      const fileName = (() => {
        try {
          return decodeURIComponent(
            (normalizedUrl.split("/").pop() || fileUrl).replace(/\+/g, " "),
          );
        } catch {
          return normalizedUrl.split("/").pop() || fileUrl;
        }
      })();
      const isCompanionPdf =
        !!companionPdfUrl &&
        (normalizedUrl === companionPdfUrl || fileUrl === companionPdfUrl);
      const isMandatoryPdf =
        isCompanionPdf ||
        (fileName.toLowerCase().endsWith(".pdf") &&
          !!requiredUrl &&
          (normalizedUrl === requiredUrl ||
            fileUrl === requiredTaskDocFileUrl));
      const finalName = buildCloseVersionDestFileName({
        fileName,
        version,
        aa,
        usesPatternNomenclatura,
        tipoAcronimo: closeVersionPreviewMeta.tipoAcronimo,
        ordinalE2E: closeVersionPreviewMeta.ordinalE2E,
        customName:
          closeCustomNames[fileUrl] || closeCustomNames[normalizedUrl],
        isMandatoryPdf:
          isMandatoryPdf && closeVersionPreviewMeta.idDocumento !== undefined,
        mandatoryOriginalBase: mandatoryPdfBase,
        idDocumento: closeVersionPreviewMeta.idDocumento,
      });
      const idDocumentoPreview = closeVersionPreviewMeta.idDocumento;
      const isPdfPreview = fileName.toLowerCase().endsWith(".pdf");
      // Solo visual: ocultar _IDDocumento en PDF; la copia sigue usando finalName real.
      const displaySourceName = isPdfPreview
        ? stripIdDocumentoFromFileName(fileName, idDocumentoPreview)
        : fileName;
      const displayFinalName =
        isPdfPreview || finalName.toLowerCase().endsWith(".pdf")
          ? stripIdDocumentoFromFileName(finalName, idDocumentoPreview)
          : finalName;
      return {
        sourceUrl: fileUrl,
        sourceName: fileName,
        displaySourceName,
        finalName,
        displayFinalName,
        isAutoIncluded:
          isCompanionPdf && !closeVersionSelectedFiles.includes(fileUrl),
      };
    });
  })();

  const assignedDocumentFolderServerRelative = assignedDocumentServerRelative
    ? getFolderUrlFromDocumentUrl(assignedDocumentServerRelative)
    : "";

  return (
    <div className={styles.wrapper}>
      {/* HEADER */}
      <div className={styles.header}>
        <div>
          <h1>{task.nombre}</h1>
          <div className={styles.metaTop}>
            <div className={styles.personBadge}>
              <span className={styles.personLabel}>Responsable</span>
              <span className={styles.personValue}>
                {task.responsable || "Sin asignar"}
              </span>
            </div>
            <div className={styles.personBadge}>
              <span className={styles.personLabel}>
                {elaboradores.length > 1 ? "Elaboradores" : "Elaborador"}
              </span>
              <span className={styles.personValue}>
                {elaboradores.length > 0
                  ? String(task.elaborador || "")
                      .split(",")
                      .map((n) => n.trim())
                      .filter(Boolean)
                      .join(" · ")
                  : "Sin asignar"}
              </span>
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {projectDetailUrl && (
            <a href={projectDetailUrl} className={styles.seeDetails}>
              Ver expediente
            </a>
          )}
          {canEditTask && (
            <a
              href={`${absolutePath}/SitePages/alta-tarea.aspx?projectid=${idProyecto}&tareaid=${taskId}`}
              className={styles.seeDetails}
            >
              Editar
            </a>
          )}
          <span className={`${styles.status} ${styles.pendiente}`}>
            {task.estado}
          </span>
        </div>
      </div>

      {/* DESCRIPCIÓN */}
      {task.descripcion && (
        <div className={styles.description}>
          {formatMultilineComment(task.descripcion)}
        </div>
      )}

      {/* BODY */}
      <div className={styles.container}>
        {/* COLUMNA PRINCIPAL */}
        <div className={styles.mainColumn}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Fechas y Documento</h3>
            <div className={styles.dataGrid}>
              <div className={styles.field}>
                <span className={styles.label}>Fecha Inicio</span>
                <span className={styles.value}>{task.fechaInicio}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Fecha Fin</span>
                <span className={styles.value}>{task.fechaFin}</span>
              </div>
              {task.tieneDeadline && (
                <div className={styles.field}>
                  <span className={styles.label}>Deadline</span>
                  <span
                    className={
                      isDeadlineExpired
                        ? `${styles.value} ${styles.deadline}`
                        : styles.value
                    }
                  >
                    {task.fechaDeadline}
                  </span>
                </div>
              )}
              <div className={styles.field}>
                <span className={styles.label}>Tipo Documento</span>
                <span className={styles.value}>
                  {task.tipoDocumento.nombre}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Versionable</span>
                <span className={styles.value}>
                  {task.esVersionable ? "Sí" : "No"}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Nº documento</span>
                <span className={styles.value}>
                  {task.numeroDocumento ?? "—"}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Versión</span>
                <span className={styles.value}>
                  {task.versionDocumento ?? "—"}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>
                  Patrón de nomenclatura
                </span>
                <span className={styles.value}>
                  {prefijoCierreVersion
                    ? prefijoCierreVersion.replace(/-$/, "")
                    : task.patronNomenclaturaId === 1
                      ? "—"
                      : "No aplica (sin patrón de nomenclatura)"}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Carpeta destino</span>
                <span className={`${styles.value} ${styles.pathValue}`}>
                  {carpetaDestinoDisplay || "No definida"}
                </span>
              </div>
            </div>
          </div>

          {/* Próxima acción */}
          {task.estado !== "Fin" && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>Próxima acción</h3>
              {taskUpdateSuccess && (
                <p className={styles.successMessage}>{taskUpdateSuccess}</p>
              )}
              {/* OK */}
              {task.estado === "AltaTareaDoc" &&
                idProyecto &&
                isCurrentUserElaborador && (
                  <>
                    <p>
                      Seleccione el documento de la carpeta de trabajo que desea
                      asignar a la tarea.
                    </p>
                    <ProjectDocumentation
                      context={context}
                      projectId={String(idProyecto)}
                      libraryName="DocumentacionTrabajo"
                      singleSelection={true}
                      allowUpload={true}
                      hideDocumentNumberColumns={true}
                      onSelectionChange={({ selectedFileUrls }) => {
                        const nextSelectedUrl =
                          selectedFileUrls && selectedFileUrls.length > 0
                            ? selectedFileUrls[0]
                            : null;
                        setSelectedFolderUrl(nextSelectedUrl);
                        if (nextSelectedUrl) {
                          setAssignDocumentError(null);
                        }
                      }}
                    />
                    <div className={styles.selectedDocPreviewPanel}>
                      <p className={styles.selectedDocPreviewTitle}>
                        Documento seleccionado
                      </p>
                      {!selectedFolderUrl ? (
                        <p className={styles.selectedDocPreviewEmpty}>
                          Selecciona un documento.
                        </p>
                      ) : (
                        <div className={styles.selectedDocPreviewItem}>
                          <span className={styles.selectedDocPreviewIcon}>
                            📄
                          </span>
                          <span className={styles.selectedDocPreviewName}>
                            {selectedFolderUrl.split("/").pop() ||
                              selectedFolderUrl}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.seeDetails}
                      onClick={() => void handleSaveSelectedDocument()}
                      disabled={
                        savingDocLocation ||
                        documentAssignCompleted ||
                        !selectedFolderUrl
                      }
                    >
                      {documentAssignCompleted
                        ? "Documento asignado"
                        : savingDocLocation
                          ? "Asignando documento..."
                          : "Asignar documento"}
                    </button>
                    {assignDocumentError && (
                      <p className={styles.assignDocumentErrorText}>
                        {assignDocumentError}
                      </p>
                    )}
                  </>
                )}
              {/* OK */}
              {task.estado === "AltaTareaDoc" &&
                idProyecto &&
                !isCurrentUserElaborador && (
                  <p>
                    Un elaborador debe añadir y seleccionar un documento de la
                    carpeta de trabajo del expediente.
                  </p>
                )}
              {/* OK */}
              {task.estado === "Borrador" &&
                idProyecto &&
                isCurrentUserElaborador && (
                  <>
                    {(task.aprobadores || []).length === 0 &&
                    (task.firmantes || []).length > 0 ? (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        disabled={isUpdatingTaskStatus}
                        onClick={() =>
                          void actualizarEstadoTarea("PendienteFirma")
                        }
                      >
                        {isUpdatingTaskStatus
                          ? "Actualizando..."
                          : "Enviar a firma"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.primaryActionButton}
                        disabled={isUpdatingTaskStatus}
                        onClick={() => void actualizarEstadoTarea("EnRevision")}
                      >
                        {isUpdatingTaskStatus
                          ? "Actualizando..."
                          : "Enviar a revisión"}
                      </button>
                    )}
                  </>
                )}
              {/* OK */}
              {task.estado === "Borrador" &&
                idProyecto &&
                !isCurrentUserElaborador && (
                  <>
                    {(task.aprobadores || []).length === 0 &&
                    (task.firmantes || []).length > 0 ? (
                      <p>Un elaborador debe enviar a firma la tarea.</p>
                    ) : (
                      <p>Un elaborador debe enviar a revisión la tarea.</p>
                    )}
                  </>
                )}

              {task.estado === "EnRevision" && (
                <>
                  {revisionPendienteUsuario ? (
                    <div className={styles.reviewActionPanel}>
                      <p className={styles.reviewHint}>
                        Tu revisión está pendiente. Puedes aprobar o rechazar en
                        cualquier momento.
                      </p>
                      <textarea
                        className={styles.reviewTextarea}
                        value={revisionComment}
                        onChange={(e) => setRevisionComment(e.target.value)}
                        placeholder="Escribe un comentario de revisión..."
                      />
                      <div className={styles.actionButtonsRow}>
                        <button
                          type="button"
                          className={styles.primaryActionButton}
                          disabled={isSubmittingRevision}
                          onClick={() =>
                            void handleResolverRevision(
                              "Aprobado",
                              revisionPendienteUsuario.id,
                            )
                          }
                        >
                          {isSubmittingRevision ? "Guardando..." : "Aprobar"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryActionButton}
                          disabled={isSubmittingRevision}
                          onClick={() =>
                            void handleResolverRevision(
                              "Rechazado",
                              revisionPendienteUsuario.id,
                            )
                          }
                        >
                          {isSubmittingRevision ? "Guardando..." : "Rechazar"}
                        </button>
                      </div>
                    </div>
                  ) : revisionesPendientes.length > 0 ? (
                    <p className={styles.reviewPendingInfo}>
                      Esperando a que los aprobadores completen la revisión.
                    </p>
                  ) : (
                    <p>No hay revisiones pendientes.</p>
                  )}
                </>
              )}

              {task.estado === "PendienteFirma" && (
                <div className={styles.flowAutoNotice}>
                  <p className={styles.flowAutoNoticeTitle}>
                    Proceso de firma en preparación
                  </p>
                  <p className={styles.flowAutoNoticeText}>
                    Se está ejecutando un proceso automático para convertir el
                    documento a PDF. En unos minutos, el estado de la tarea se
                    actualizará automáticamente a <strong>EnFirma</strong>.
                  </p>
                  <p className={styles.flowAutoNoticeText}>
                    Para ver el cambio, refresca esta página pasados unos
                    minutos.
                  </p>
                </div>
              )}

              {task.estado === "EnFirma" && (
                <>
                  {firmaParaUsuario && firmaPendienteParaUsuario ? (
                    <div className={styles.signingFlowPanel}>
                      <div className={styles.signingFlowHeader}>
                        <div
                          className={styles.signingFlowIconWrap}
                          aria-hidden="true"
                        >
                          <span className={styles.signingFlowIcon} />
                        </div>
                        <div className={styles.signingFlowMeta}>
                          <span className={styles.signingFlowLabel}>
                            Proceso de firma documental
                          </span>
                          <span className={styles.signingFlowHint}>
                            Descargue el documento, fírmelo externamente,
                            selecciónelo desde su ordenador y confirme su firma.
                          </span>
                        </div>
                      </div>

                      <div className={styles.signingSteps}>
                        <section className={styles.signingStep}>
                          <span className={styles.signingStepBadge}>1</span>
                          <div className={styles.signingStepContent}>
                            <h4 className={styles.signingStepTitle}>
                              Descargar documento
                            </h4>
                            <p className={styles.signingStepText}>
                              Obtenga el documento actual de la tarea para
                              firmarlo.
                            </p>
                            {assignedDocumentOpenUrl ? (
                              <div className={styles.signingDocumentCard}>
                                <span className={styles.signingDocumentIcon}>
                                  📄
                                </span>
                                <span className={styles.signingDocumentName}>
                                  {assignedDocumentSigningLabel}
                                </span>
                                <a
                                  href="#"
                                  className={styles.signingDownloadButton}
                                  onClick={(e) =>
                                    void handleDownloadAssignedDocument(e)
                                  }
                                  aria-busy={isDownloadingAssignedDoc}
                                >
                                  {isDownloadingAssignedDoc
                                    ? "Descargando..."
                                    : "Descargar"}
                                </a>
                              </div>
                            ) : (
                              <p className={styles.signingStepWarning}>
                                No hay documento disponible para descargar.
                              </p>
                            )}
                          </div>
                        </section>

                        <section className={styles.signingStep}>
                          <span className={styles.signingStepBadge}>2</span>
                          <div className={styles.signingStepContent}>
                            <h4 className={styles.signingStepTitle}>
                              Seleccionar documento firmado
                            </h4>
                            <p className={styles.signingStepText}>
                              Seleccione desde su ordenador el documento firmado.
                              Se subirá y reemplazará el archivo de la tarea al
                              confirmar la firma en el paso 3.
                            </p>
                            <div className={styles.signingLocalFilePicker}>
                              <label className={styles.signingFileInputLabel}>
                                Seleccionar archivo
                                <input
                                  ref={firmanteSignedFileInputRef}
                                  type="file"
                                  className={styles.signingFileInput}
                                  onChange={(event) => {
                                    const inputEl = event.currentTarget;
                                    const file = inputEl.files?.item(0) || null;
                                    setFirmanteSignedLocalFile(file);
                                    if (file) {
                                      setFirmanteDocumentError(null);
                                    }
                                    inputEl.value = "";
                                  }}
                                />
                              </label>
                              {firmanteSignedLocalFile ? (
                                <div className={styles.signingDocumentCard}>
                                  <span className={styles.signingDocumentIcon}>
                                    📄
                                  </span>
                                  <span className={styles.signingDocumentName}>
                                    {firmanteSignedLocalFile.name}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.signingClearFileButton}
                                    onClick={() => {
                                      setFirmanteSignedLocalFile(null);
                                      setFirmanteDocumentError(null);
                                      if (firmanteSignedFileInputRef.current) {
                                        firmanteSignedFileInputRef.current.value =
                                          "";
                                      }
                                    }}
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ) : (
                                <p className={styles.signingStepWarning}>
                                  Aún no ha seleccionado ningún archivo.
                                </p>
                              )}
                            </div>
                          </div>
                        </section>

                        <section className={styles.signingStep}>
                          <span className={styles.signingStepBadge}>3</span>
                          <div className={styles.signingStepContent}>
                            <h4 className={styles.signingStepTitle}>
                              Confirmar firma
                            </h4>
                            <p className={styles.signingStepText}>
                              Al confirmar, se subirá el documento seleccionado,
                              reemplazará el archivo de la tarea conservando sus
                              metadatos y se registrará su firma.
                            </p>
                            <button
                              type="button"
                              className={styles.primaryActionButton}
                              disabled={
                                isSubmittingFirma || !firmanteSignedLocalFile
                              }
                              onClick={() => {
                                setFirmanteDocumentError(null);
                                setShowConfirmFirmaDialog(true);
                              }}
                            >
                              Confirmar firma
                            </button>
                          </div>
                        </section>
                      </div>

                      {firmanteDocumentError && (
                        <p className={styles.assignDocumentErrorText}>
                          {firmanteDocumentError}
                        </p>
                      )}
                    </div>
                  ) : firmaParaUsuario ? (
                    <div className={styles.signingCompletedNotice}>
                      <p className={styles.signingCompletedTitle}>
                        Firma completada
                      </p>
                      <p className={styles.signingCompletedText}>
                        Ya ha registrado su firma para esta tarea.
                      </p>
                    </div>
                  ) : (
                    <p className={styles.reviewPendingInfo}>
                      Esperando a que los firmantes completen la tarea.
                    </p>
                  )}
                </>
              )}

              {task.estado === "Aprobado" && idProyecto && (
                <>
                  {task.convertirAPDF &&
                  (task.firmantes || []).length === 0 &&
                  (isCheckingPdfConversion || !pdfConvertedReady) ? (
                    <div className={styles.flowAutoNotice}>
                      <p className={styles.flowAutoNoticeTitle}>
                        Conversión a PDF en curso
                      </p>
                      <p className={styles.flowAutoNoticeText}>
                        Se está ejecutando un proceso automático de conversión
                        del documento a PDF. Cuando finalice, podrás cerrar la
                        versión.
                      </p>
                      <p className={styles.flowAutoNoticeText}>
                        Para ver el cambio, refresca esta página pasados unos
                        minutos.
                      </p>
                    </div>
                  ) : canCloseVersion ? (
                    <button
                      type="button"
                      className={styles.primaryActionButton}
                      disabled={isLoadingCloseVersionPerm}
                      onClick={async () => {
                        setCloseVersionError(null);
                        setRequiredTaskDocFileUrl(null);
                        setRequiredTaskDocFileName("");

                        const requiredDoc = await getRequiredTaskDocumentFile();
                        const preselected = requiredDoc.fileUrl
                          ? [requiredDoc.fileUrl]
                          : [];
                        setRequiredTaskDocFileUrl(requiredDoc.fileUrl);
                        setRequiredTaskDocFileName(requiredDoc.fileName || "");
                        setCloseVersionSelectedFiles(preselected);

                        const initialNames: Record<string, string> = {};
                        preselected.forEach((u) => {
                          initialNames[u] = u.split("/").pop() || "";
                        });
                        setCloseCustomNames(initialNames);
                        setShowCerrarVersionModal(true);
                        void loadCloseVersionPreviewMeta(
                          requiredDoc.fileUrl,
                          requiredDoc.idDocumento,
                        );
                      }}
                    >
                      {isLoadingCloseVersionPerm
                        ? "Preparando..."
                        : "Cerrar versión"}
                    </button>
                  ) : (
                    <p className={styles.reviewPendingInfo}>
                      No tienes permisos para cerrar versión.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* COLUMNA LATERAL */}
        <div className={styles.sideColumn}>
          {(openLocationUrl || showArchiveCopyNotice) && (
            <div className={styles.card}>
              <div className={styles.assignedDocHeader}>
                <h3 className={styles.sectionTitleLink}>Documento asignado:</h3>
                {!showArchiveCopyNotice &&
                assignedDocumentOpenUrl &&
                assignedDocumentDisplayName ? (
                  <>
                    <a
                      href="#"
                      className={styles.assignedDocFileLink}
                      onClick={(e) => void handleDownloadAssignedDocument(e)}
                      aria-busy={isDownloadingAssignedDoc}
                    >
                      {isDownloadingAssignedDoc
                        ? "Descargando..."
                        : assignedDocumentDisplayName}
                    </a>
                    {assignedDocumentExt ? (
                      <span
                        className={`${styles.assignedDocExtBadge} ${
                          assignedDocumentExt === "PDF"
                            ? styles.assignedDocExtBadgePdf
                            : assignedDocumentExt === "DOCX" ||
                                assignedDocumentExt === "DOC"
                              ? styles.assignedDocExtBadgeDocx
                              : ""
                        }`}
                      >
                        {assignedDocumentExt}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
              {showArchiveCopyNotice ? (
                <div className={styles.flowAutoNotice}>
                  <p className={styles.flowAutoNoticeTitle}>
                    Copia a archivo en curso
                  </p>
                  <p className={styles.flowAutoNoticeText}>
                    Se está ejecutando un flujo automático de copiado de los
                    documentos asociados a la tarea. Pasados unos minutos,
                    refresca esta página y podrás ver el documento.
                  </p>
                </div>
              ) : null}
              {openLocationUrl ? (
                <a
                  href={openLocationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.seeDetails}
                >
                  Abrir ubicación
                </a>
              ) : null}
            </div>
          )}
          {task.requiereAprobacion && (task.aprobadores || []).length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>Aprobadores</h3>
              <button
                onClick={() => setShowAprobadores(true)}
                className={styles.seeDetails}
              >
                Ver detalle
              </button>
            </div>
          )}

          {task.requiereFirma && (task.firmantes || []).length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>Firmantes</h3>
              <button
                onClick={() => setShowFirmantes(true)}
                className={styles.seeDetails}
              >
                Ver detalle
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODALES */}
      {showAprobadores && task.aprobadores.length > 0 && (
        <TaskModal
          title="Detalle de Aprobadores"
          items={task.aprobadores}
          onClose={() => setShowAprobadores(false)}
          showOrden={false}
        />
      )}
      {showFirmantes && task.firmantes.length > 0 && (
        <TaskModal
          title="Detalle de Firmantes"
          items={task.firmantes}
          onClose={() => setShowFirmantes(false)}
          showOrden={false}
          showComentario={false}
        />
      )}

      {showConfirmFirmaDialog && (
        <div
          className={styles.confirmOverlay}
          onClick={() => {
            if (!isSubmittingFirma) setShowConfirmFirmaDialog(false);
          }}
          role="presentation"
        >
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-firma-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4
              id="confirm-firma-dialog-title"
              className={styles.confirmDialogTitle}
            >
              Confirmar firma del documento
            </h4>
            <p className={styles.confirmDialogMessage}>
              ¿Confirma que ha firmado el documento{" "}
              <strong>
                {assignedDocumentLinkLabel || "de la tarea"}
              </strong>
              ? Al aceptar, se subirá el archivo seleccionado y reemplazará el
              documento actual de la tarea.
            </p>
            {firmanteSignedLocalFile && (
              <p className={styles.confirmDialogFile}>
                Archivo a subir:{" "}
                <strong>{firmanteSignedLocalFile.name}</strong>
              </p>
            )}
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                onClick={() => setShowConfirmFirmaDialog(false)}
                disabled={isSubmittingFirma}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmPrimaryButton}
                onClick={() => void handleConfirmFirma()}
                disabled={isSubmittingFirma}
              >
                {isSubmittingFirma
                  ? "Subiendo y confirmando..."
                  : "Sí, confirmar firma"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCerrarVersionModal && idProyecto && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Cerrar versión</h2>
              <button
                className={styles.closeBtn}
                onClick={() => {
                  setShowConfirmCerrarVersionDialog(false);
                  setShowCerrarVersionModal(false);
                }}
              >
                ✖
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.closeVersionInfoPanel}>
                <div className={styles.closeVersionInfoItem}>
                  <span className={styles.closeVersionInfoLabel}>
                    Número documento
                  </span>
                  <span className={styles.closeVersionInfoValue}>
                    {task?.numeroDocumento ?? "—"}
                  </span>
                </div>
                <div className={styles.closeVersionInfoItem}>
                  <span className={styles.closeVersionInfoLabel}>Versión</span>
                  <span className={styles.closeVersionInfoValue}>
                    {task?.versionDocumento ?? "—"}
                  </span>
                </div>
              </div>

              <div className={styles.closeVersionDocsSection}>
                <ProjectDocumentation
                  context={context}
                  projectId={String(idProyecto)}
                  hideDocumentNumberColumns={true}
                  selectFilesOnly={true}
                  initialSelectedFileUrls={closeVersionSelectedFiles}
                  requiredFileUrl={requiredTaskDocFileUrl}
                  onSelectionChange={({ selectedFileUrls }) => {
                    const nextUrls = selectedFileUrls || [];
                    setCloseVersionSelectedFiles(nextUrls);
                    setCloseCustomNames((prev) => {
                      const next: Record<string, string> = {};
                      nextUrls.forEach((url) => {
                        const fallback = url.split("/").pop() || "";
                        next[url] = prev[url] || fallback;
                      });
                      return next;
                    });
                  }}
                />
              </div>

              <div className={styles.selectedDocsPanel}>
                <p className={styles.selectedDocsTitle}>
                  Documentos seleccionados
                </p>
                {closeVersionSelectedFiles.length === 0 ? (
                  <p className={styles.selectedDocsEmpty}>
                    No hay documentos seleccionados.
                  </p>
                ) : (
                  <ul className={styles.selectedDocsList}>
                    {closeVersionSelectedFiles.map((fileUrl) => {
                      const fileName = fileUrl.split("/").pop() || fileUrl;
                      const isRequired =
                        !!requiredTaskDocFileUrl &&
                        fileUrl === requiredTaskDocFileUrl;
                      return (
                        <li key={fileUrl} className={styles.selectedDocItem}>
                          <span className={styles.selectedDocName}>
                            {fileName}
                          </span>
                          {isRequired && (
                            <span className={styles.requiredDocBadge}>
                              Documento obligatorio
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {task?.patronNomenclaturaId !== 1 &&
                closeVersionSelectedFiles.length > 0 && (
                  <div className={styles.selectedDocsPanel}>
                    <p className={styles.selectedDocsTitle}>
                      Nombre definitivo de los ficheros
                    </p>
                    <ul className={styles.selectedDocsList}>
                      {closeVersionSelectedFiles.map((fileUrl) => {
                        const fileName = fileUrl.split("/").pop() || fileUrl;
                        const isRequiredDoc =
                          !!requiredTaskDocFileUrl &&
                          (fileUrl === requiredTaskDocFileUrl ||
                            resolveServerRelativeDocumentUrl(
                              fileUrl,
                              webServerRelativePath,
                            ) ===
                              resolveServerRelativeDocumentUrl(
                                requiredTaskDocFileUrl,
                                webServerRelativePath,
                              ));
                        return (
                          <li
                            key={`${fileUrl}-name`}
                            className={styles.selectedDocItem}
                          >
                            <span className={styles.selectedDocName}>
                              {fileName}
                            </span>
                            <input
                              className={styles.versionInput}
                              value={closeCustomNames[fileUrl] || ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                setCloseCustomNames((prev) => {
                                  const next: Record<string, string> = {
                                    ...prev,
                                    [fileUrl]: value,
                                  };
                                  // Si se renombra el docx obligatorio, sincronizar el PDF asociado.
                                  const companionPdfUrl =
                                    closeVersionPreviewMeta.companionPdfUrl;
                                  const idDocumento =
                                    closeVersionPreviewMeta.idDocumento;
                                  if (
                                    isRequiredDoc &&
                                    companionPdfUrl &&
                                    idDocumento !== undefined
                                  ) {
                                    const customBase = getFileBaseName(value);
                                    if (customBase) {
                                      const idSuffix = `_${idDocumento}`;
                                      const pdfBase = customBase
                                        .toLowerCase()
                                        .endsWith(idSuffix.toLowerCase())
                                        ? customBase
                                        : `${customBase}${idSuffix}`;
                                      next[companionPdfUrl] = `${pdfBase}.pdf`;
                                    }
                                  }
                                  return next;
                                });
                              }}
                              placeholder="Nombre definitivo"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

              {closeVersionNamePreviews.length > 0 && (
                <div className={styles.selectedDocsPanel}>
                  <p className={styles.selectedDocsTitle}>
                    Previsualización del nombre definitivo
                  </p>
                  <ul className={styles.selectedDocsList}>
                    {closeVersionNamePreviews.map((preview) => (
                      <li
                        key={`${preview.sourceUrl}-preview`}
                        className={styles.selectedDocItem}
                      >
                        <div className={styles.closeVersionPreviewRow}>
                          <span className={styles.selectedDocName}>
                            {preview.displaySourceName || preview.sourceName}
                            {preview.isAutoIncluded
                              ? " (PDF asociado, se incluirá automáticamente)"
                              : ""}
                          </span>
                          <span className={styles.closeVersionPreviewArrow}>
                            →
                          </span>
                          <span className={styles.closeVersionPreviewFinal}>
                            {preview.displayFinalName || preview.finalName}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {closeVersionError && (
                <p className={styles.closeVersionErrorBox}>
                  {closeVersionError}
                </p>
              )}

              <div className={styles.modalActionsRow}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={isClosingVersion}
                  onClick={() => {
                    setShowConfirmCerrarVersionDialog(false);
                    setShowCerrarVersionModal(false);
                    setCloseCustomNames({});
                    setRequiredTaskDocFileUrl(null);
                    setRequiredTaskDocFileName("");
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.seeDetails}
                  disabled={isClosingVersion}
                  onClick={() => {
                    if (task?.patronNomenclaturaId !== 1) {
                      setCloseVersionError(null);
                      setShowConfirmCerrarVersionDialog(true);
                      return;
                    }
                    void handleCerrarVersion();
                  }}
                >
                  {isClosingVersion ? "Cerrando..." : "Cerrar versión"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmCerrarVersionDialog && (
        <div
          className={styles.confirmOverlay}
          onClick={() => {
            if (!isClosingVersion) {
              setShowConfirmCerrarVersionDialog(false);
              setShowCerrarVersionModal(true);
            }
          }}
          role="presentation"
        >
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-cerrar-version-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4
              id="confirm-cerrar-version-dialog-title"
              className={styles.confirmDialogTitle}
            >
              Confirmar nombres de documentos
            </h4>
            <p className={styles.confirmDialogMessage}>
              ¿Está seguro de que los nombres de los documentos que se van a
              copiar en la biblioteca de archivos son correctos?
            </p>
            {closeVersionNamePreviews.length > 0 && (
              <ul className={styles.selectedDocsList}>
                {closeVersionNamePreviews.map((preview) => (
                  <li
                    key={`${preview.sourceUrl}-confirm`}
                    className={styles.confirmDialogFile}
                  >
                    <strong>
                      {preview.displayFinalName || preview.finalName}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.confirmDialogActions}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                onClick={() => {
                  setShowConfirmCerrarVersionDialog(false);
                  setShowCerrarVersionModal(true);
                }}
                disabled={isClosingVersion}
              >
                No, revisar nombres
              </button>
              <button
                type="button"
                className={styles.confirmPrimaryButton}
                onClick={() => {
                  setShowConfirmCerrarVersionDialog(false);
                  void handleCerrarVersion();
                }}
                disabled={isClosingVersion}
              >
                {isClosingVersion
                  ? "Cerrando..."
                  : "Sí, nombres correctos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetail;
