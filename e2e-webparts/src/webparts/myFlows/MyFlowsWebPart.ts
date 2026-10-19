import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneSlider,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'MyFlowsWebPartStrings';
import MyFlows from '../../ui/myFlows/components/MyFlows';
import { IMyFlowsProps } from '../../ui/myFlows/components/IMyFlowsProps';

export interface IMyFlowsWebPartProps {
  description: string;
  itemsPerPage: number;
}

export default class MyFlowsWebPart extends BaseClientSideWebPart<IMyFlowsWebPartProps> {

  public render(): void {
    const element: React.ReactElement<IMyFlowsProps> = React.createElement(
      MyFlows,
      {
        context: this.context,
        itemsPerPage:
          typeof this.properties.itemsPerPage === "number" &&
            this.properties.itemsPerPage > 0
            ? this.properties.itemsPerPage
            : 10,
        hasTeamsContext: !!this.context.sdks.microsoftTeams,
      }
    );

    ReactDom.render(element, this.domElement);
  }

  // protected onInit(): Promise<void> {
  //   if (
  //     typeof this.properties.itemsPerPage !== "number" ||
  //     this.properties.itemsPerPage <= 0
  //   ) {
  //     this.properties.itemsPerPage = 10;
  //   }
  //   return 'this._getEnvironmentMessage().then(message => {
  //     this._environmentMessage = message;
  //   })';
  // }



  // private _getEnvironmentMessage(): Promise<string> {
  //   if (!!this.context.sdks.microsoftTeams) { // running in Teams, office.com or Outlook
  //     return this.context.sdks.microsoftTeams.teamsJs.app.getContext()
  //       .then(context => {
  //         let environmentMessage: string = '';
  //         switch (context.app.host.name) {
  //           case 'Office': // running in Office
  //             environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOffice : strings.AppOfficeEnvironment;
  //             break;
  //           case 'Outlook': // running in Outlook
  //             environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOutlook : strings.AppOutlookEnvironment;
  //             break;
  //           case 'Teams': // running in Teams
  //           case 'TeamsModern':
  //             environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentTeams : strings.AppTeamsTabEnvironment;
  //             break;
  //           default:
  //             environmentMessage = strings.UnknownEnvironment;
  //         }

  //         return environmentMessage;
  //       });
  //   }

  //   return Promise.resolve(this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentSharePoint : strings.AppSharePointEnvironment);
  // }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }

    const {
      semanticColors
    } = currentTheme;

    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }

  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('description', {
                  label: strings.DescriptionFieldLabel
                }),
                PropertyPaneSlider('itemsPerPage', {
                  label: strings.ItemsPerPageFieldLabel,
                  min: 3,
                  max: 50,
                  step: 1,
                  value: this.properties.itemsPerPage || 10,
                  showValue: true
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
