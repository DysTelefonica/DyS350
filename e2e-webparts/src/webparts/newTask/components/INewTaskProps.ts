import { WebPartContext } from "@microsoft/sp-webpart-base";
export interface INewTaskProps {
  context: WebPartContext;
}

export interface ITaskForm {
  proyectoId: string | null;
  proyectoNombre: string;

  nombre: string;
  descripcion: string;

  fechaInicio: string;
  fechaFin?: string;

  estado: string;
  responsable: string | null;
  /** Elaboradores de la tarea (uno o varios nombres separados por coma). */
  elaborador?: string;

  tipoDocumento: string;
  carpetaBase: string;
  carpetaDocumento: string;
  esVersionable: boolean;

  /** Patrón de nomenclatura asociado al expediente. */
  patronNomenclatura?: string;
  obligatorio: boolean;
  entregable: boolean;

  fechaEntrega?: string;

  tieneDeadline: boolean;
  fechaDeadline?: string;

  requiereAprobacion: boolean;
  /** Aprobadores de la tarea (sin orden; cualquiera puede aprobar). */
  aprobadores: string[];

  requiereFirma: boolean;
  firmantes: string[];

  /** Si true, el documento de la tarea se convertirá a PDF. */
  convertirAPDF: boolean;

  parrafoBloqueado?: string;

  docName: string;
  docDescription: string;
}
