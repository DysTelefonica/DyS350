import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IProjectChartsProps {
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  /** Contexto de SPFx para poder leer la lista Expedientes. */
  context: WebPartContext;
}
