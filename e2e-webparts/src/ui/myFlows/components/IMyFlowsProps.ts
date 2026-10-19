import { WebPartContext } from "@microsoft/sp-webpart-base";

export interface IMyFlowsProps {
  context: WebPartContext;
  itemsPerPage?: number;
  hasTeamsContext?: boolean;
}
