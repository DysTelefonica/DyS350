import { WebPartContext } from "@microsoft/sp-webpart-base";
export interface ITaskDetailProps {
  context: WebPartContext;
}

export interface IUser {
  id: number;
  nombre: string;
  email?: string;
}

export interface IFlowUser {
  orden: number;
  usuario: IUser;
  estado:
    | "AltaTareaDoc"
    | "Borrador"
    | "EnRevision"
    | "Pendiente"
    | "EnFirma"
    | "Aprobado"
    | "Versionado"
    | "Entregado"
    | "Finalizado";
  fecha?: string;
  comentario?: string;
}

export interface ITipoDocumento {
  nombre: string;
}

export interface ITaskDetail {
  // proyectoNombre: string;
  // nombre: string;
  // descripcion: string;
  // estado: string;
  // responsable: string;

  // fechaInicio: string;
  // fechaFin: string;
  // fechaEntrega?: string;
  // fechaDeadline?: string;

  // tipoDocumento: string;
  // carpetaBase: string;
  // carpetaDocumento: string;

  // sigueNomenclatura: boolean;
  // obligatorio: boolean;
  // entregable: boolean;
  // tieneDeadline: boolean;

  // requiereAprobacion: boolean;
  // aprobadores: string[];

  // requiereFirma: boolean;
  // firmantes: string[];

  // observaciones?: string;
  proyectoNombre: string;
  nombre: string;
  descripcion: string;
  estado:
    | "AltaTareaDoc"
    | "Borrador"
    | "EnRevision"
    | "PendienteFirma"
    | "EnFirma"
    | "Aprobado"
    | "Versionado"
    | "Fin"
    | "Entregado"
    | "Finalizado";
  responsable: string;
  elaborador?: string; // Uno o varios nombres separados por coma.
  carpetaDestino?: string;
  patronNomenclaturaId?: number;
  esVersionable?: boolean;
  esEntregable?: boolean;
  fechaInicio: string;
  fechaFin: string;
  tipoDocumento: ITipoDocumento;
  idTipo?: number;
  requiereAprobacion: boolean;
  requiereFirma: boolean;
  convertirAPDF?: boolean;
  aprobadores: IFlowUser[];
  firmantes: IFlowUser[];
  tieneDeadline: boolean;
  fechaDeadline?: string;
  numeroDocumento?: number;
  versionDocumento?: number;
  /** Acrónimo del tipo (prefijo cierre de versión con patrón). */
  acronimo?: string;
  /** Ordinal E2E del expediente (prefijo cierre de versión con patrón). */
  ordinalE2E?: string;
  /** Estado del archivado por flujo (p. ej. Pendiente tras cerrar versión). */
  estadoArchivado?: string;
}
