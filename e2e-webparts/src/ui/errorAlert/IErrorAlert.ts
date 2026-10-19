export interface IErrorAlertProps {
  title?: string;
  message: string;
  details?: string;
  onRetry?: () => void;
}
