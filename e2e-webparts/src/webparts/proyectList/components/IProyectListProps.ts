import { WebPartContext } from "@microsoft/sp-webpart-base";
export interface IProyectListProps {
  context: WebPartContext;
  /** Número de expedientes por página configurado en el webpart. */
  itemsPerPage?: number;
}

export interface IProyectItem {
  // Id del item en la lista de SharePoint
  itemId: number;
  idexpediente: number;
  nemotecnico: string;
  title: string;
  expediente: string;
  startDate: string;
  endDate: string;
  /** Literal de Estado guardado en la lista Expedientes. */
  estado: string;
  /** Literal de Cliente guardado en la lista Expedientes. */
  cliente: string;
  clasificacion: string;
  favorito: boolean;
  /** Texto agregado para compatibilidad, pero en la UI usamos juridicaList. */
  juridica: string;
  /** Lista de nombres de suministradores (Title en la lista Suministradores) asociados al IDProyecto. */
  juridicaList: string[];
  /** Lista de nombres de integrantes (Title en la lista Roles_usuario) asociados al IDExpediente. */
  miembros: string[];
  /** Indica si el usuario logueado pertenece a este expediente. */
  hasCurrentUser: boolean;
}
