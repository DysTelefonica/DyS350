import * as React from "react";
import styles from "./Loading.module.scss";

export interface ILoadingProps {
  message?: string;
}

export const Loading: React.FC<ILoadingProps> = ({ message }) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.spinnerWrapper}>
          <div className={styles.spinnerOuter}>
            <div className={styles.spinnerInner} />
          </div>
        </div>
        <div className={styles.textBlock}>
          <h2>Cargando</h2>
          <p>{message || "Preparando la información, por favor espera..."}</p>
        </div>
      </div>
    </div>
  );
};

export default Loading;

