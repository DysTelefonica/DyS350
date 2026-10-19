import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IProjectDocumentationProps {
  context: WebPartContext;
  projectId: string | null;
  /** Nombre de la biblioteca raíz a navegar. */
  libraryName?: string;
  /** Número de tareas por página recibido desde el webpart (opcional). */
  itemsPerPage?: number;
  /** Ficheros que deben aparecer seleccionados al abrir el navegador. */
  initialSelectedFileUrls?: string[];
  /** Fichero obligatorio que no puede deseleccionarse. */
  requiredFileUrl?: string | null;
  /** Si es true, solo permite seleccionar un fichero. */
  singleSelection?: boolean;
  /** Si es false, oculta y deshabilita selección por checks. */
  selectable?: boolean;
  /** Si es true, muestra botón para subir documentos. */
  allowUpload?: boolean;
  /** Si es true, muestra buscador de documentos (Search API) en DocumentacionArchivo. */
  enableSearchInDocumentacion?: boolean;
  /** Carpeta inicial (server-relative) para listar archivos. */
  initialFolderServerRelativeUrl?: string | null;
  /** Si es true, impide navegar fuera de initialFolderServerRelativeUrl. */
  lockToInitialFolder?: boolean;
  /** URL server-relative del fichero a reemplazar al subir (conserva metadatos). */
  replaceFileServerRelativeUrl?: string | null;
  /** Valores de respaldo para N.º documento y versión en vista bloqueada. */
  fileMetadataFallback?: {
    numeroDocumento?: number;
    versionDocumento?: number;
  } | null;
  /** Filtra archivos por metadato IDTipo en DocumentacionArchivo. */
  filterByIdTipo?: number | null;
  /** Muestra solo la última versión por NumeroDocumento (mayor VersionDocumento). */
  latestVersionPerNumeroOnly?: boolean;
  /** Oculta el panel lateral de carpetas (solo selección de ficheros). */
  hideFolderPanel?: boolean;
  /** Oculta las columnas N.º documento y Versión en la tabla de archivos. */
  hideDocumentNumberColumns?: boolean;
  /** Solo ficheros seleccionables; navegación exclusiva por el panel lateral de carpetas. */
  selectFilesOnly?: boolean;
  /** Si se define, solo se muestran los ficheros con estas URLs server-relative. */
  restrictToFileUrls?: string[];
  /** Callback opcional tras subir documentos correctamente. */
  onUploadComplete?: (payload?: { fileUrl?: string | null }) => void;
  /** Callback opcional para notificar selección de documento/carpeta. */
  onSelectionChange?: (payload: {
    fileUrl: string | null;
    folderUrl: string | null;
    selectedFileUrls?: string[];
    selectedFileMetadata?: {
      numeroDocumento: number | null;
      versionDocumento: number | null;
    } | null;
  }) => void;
}

// export interface ITaskItem {
//   taskid: number;
//   title: string;
//   startDate: string;
//   endDate: string;
//   estado: string;
//   responsable: string;
//   docNum: number;
// }
