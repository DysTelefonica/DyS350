import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IMyTasksProps {
  context: WebPartContext;
  description: string;
  itemsPerPage: number;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  userEmail: string;
}
