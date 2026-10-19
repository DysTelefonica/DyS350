import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface ITaskProps {
  context: WebPartContext;
  projectId: string | null;
  /** Si se informa, filtra por múltiples expedientes (IDProyecto). */
  projectIds?: number[];
  /** Número de tareas por página recibido desde el webpart (opcional). */
  itemsPerPage?: number;
  /** Título opcional para el encabezado del listado. */
  listTitle?: string;
  /** Activa filtro de tareas relacionadas al usuario (modo MyTasks). */
  myTasksUserName?: string;
  /** Activa filtro de flujos pendientes del usuario (modo MyFlows). */
  myFlowsUserName?: string;
  /** Si se informa, fuerza filtro de estados en servidor (OR entre valores). */
  forcedEstados?: string[];
  /** Si es true, muestra columnas de flujo (aprobadores pendientes y firmantes). */
  showFlowColumns?: boolean;

  displayTitle?: boolean;
}

export interface ITaskItem {
  taskid: number;
  title: string;
  startDate: string;
  endDate: string;
  estado: string;
  responsable: string;
  docNum: number;
}
