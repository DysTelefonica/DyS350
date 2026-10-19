import { WebPartContext } from "@microsoft/sp-webpart-base";
export interface INewProjectProps {
  context: WebPartContext;
}

export interface IProjectForm {
  idexpediente: number;
  /** IDProyecto en la lista Expedientes (numérico). */
  idproyecto?: number;
  idexpedientepadre?: number;
  nemotecnico: string;
  titulo: string;
  importelicitacion?: number;
  importecontratacion?: number;
  codproyecto?: string;
  codexp?: string;
  codexplargo?: string;
  /** CodS4h es texto en la lista Expedientes. */
  cods4h?: string;
  fechainiciocontrato?: string;
  fechafincontrato?: string;
  fechafingarantia?: string;
  esam?: string;
  eslote?: string;
  esbasado?: string;
  esexpediente?: string;
  ordinal?: number;
  /** OrdinalE2E proveniente de la lista ExpedientesJSON. */
  ordinale2e?: number;
  idgradoclasificacion?: number;
  idorganocontratacion?: number;
  idoficinaprograma?: number;
  idejercito?: number;
  observaciones?: string;
  idestado?: number;
  ambito?: string;
  npedido?: number;
  idresponsablecalidad?: number;
  adjudicado?: string;
  tipo?: string;
  tipoinforme?: string;
  cadenapecal?: string;
  fechapreoferta?: string;
  fechainiciolicitacion?: string;
  fechaoferta?: string;
  fechaadjudicacion?: string;
  fechafirmacontrato?: string;
  garantiameses?: string;
  fechacertificacion?: string;
  fechaperdida?: string;
  fechadesestimada?: string;
  codigoactividad?: number;
  contratistaprincipal?: string;
  idresponsableseguridad?: string;
  suministradores?: any[];
  tiposproyecto?: number;
  jefeproyecto?: string;
  cliente?: string;
  favorito?: boolean;
  responsables?: IResponsable[];
  /** Técnico de calidad (un valor). Viene en el JSON como objeto con nombre. */
  responsableCalidad?: { id?: number; nombre?: string; correousuario?: string; matricula?: string };
  /** Técnico de documentación (un valor). Viene en el JSON como objeto con nombre. */
  responsableSeguridad?: { id?: number; nombre?: string; correousuario?: string; matricula?: string };
}

export interface IExpedienteTreeNode {
  expediente: IProjectForm;
  hijos: IExpedienteTreeNode[];
  nivel: number;
  yaExiste?: boolean;
}

export interface ITipoExpediente {
  idTipoExpediente: number;
  title: string;
}

export interface IProvisioningConfig {
  expedienteId: number;
  carpetas: string[];
  usarPlantilla: boolean;
  nombrePlantilla?: string;
  noGenerarCarpetas: boolean;
  /** Si el usuario marca "Extender..." en el nodo raíz, copia la plantilla a todos los hijos. */
  extenderEstructuraAHijos: boolean;
  patronNomenclaturaId?: number;
  plantillaAprovisionamientoId?: number;
  /** IDTipoExpediente de la lista TipoExpediente → columna IDTipoExpediente en Expedientes. */
  tipoExpedienteId?: number;
}

export interface IPlantillaAprovisionamiento {
  id: string;
  nombre: string;
  carpetas: string[];
}

export interface IResponsable {
  idexpedienteresponsable: number;
  idexpediente: number;
  idusuario: number;
  correosiempre: string;
  esjefeproyecto: string;
  id: number;
  correousuario: string;
  nombre: string;
  matricula: string;
}
