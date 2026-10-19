import * as React from "react";
import styles from "./ErrorAlert.module.scss";
import { IErrorAlertProps } from "./IErrorAlert";

export const ErrorAlert: React.FC<IErrorAlertProps> = ({
  title = "Ha ocurrido un error",
  message,
  onRetry,
}) => {
  return (
    <div className={styles.container}>
    <div className={styles.wrapper} role="alert">
      <div className={styles.icon}>⚠️</div>

      <div className={styles.content}>
        <h4 className={styles.title}>{title}</h4>
        <p className={styles.message}>{message}</p>
        {onRetry && (
          <button className={styles.retry} onClick={onRetry}>
            Reintentar
          </button>
        )}
      </div>
    </div>
    </div>
  );
};
