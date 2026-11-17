import { ApplicationCustomizerContext } from "@microsoft/sp-application-base";

export interface INavBarProps {
    context: ApplicationCustomizerContext;
    links: { href: string, text: string }[];
    pageUrl: string;
}