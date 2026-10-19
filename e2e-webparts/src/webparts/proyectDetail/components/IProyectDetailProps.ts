import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IProyectDetailProps {
  context: WebPartContext;
  /** Número de tareas por página configurado en el webpart. */
  itemsPerPage?: number;
}
