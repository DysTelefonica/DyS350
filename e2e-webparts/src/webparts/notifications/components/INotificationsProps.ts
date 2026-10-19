import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface INotificationsProps {
  context: WebPartContext;
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  userEmail: string;
}
