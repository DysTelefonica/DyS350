import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IGeneralLinksProps {
  context: WebPartContext;
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  generalLinksTitle: string;
  kpisLinksTitle: string;
}
