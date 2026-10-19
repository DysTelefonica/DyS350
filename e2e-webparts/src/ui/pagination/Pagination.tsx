import * as React from "react";
import styles from "./Pagination.module.scss";

const Pagination = ({
  page,
  setPage,
  totalPages,
}: {
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
}) => {
  const getVisibleItems = (): Array<number | string> => {
    if (totalPages <= 3) {
      // @ts-ignore
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const items: Array<number | string> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) {
      items.push("ellipsis-left");
    }

    for (let n = start; n <= end; n++) {
      items.push(n);
    }

    if (end < totalPages - 1) {
      items.push("ellipsis-right");
    }

    items.push(totalPages);
    return items;
  };

  const visibleItems = getVisibleItems();

  return (
    <div className={styles.pagination}>
      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
        ◀
      </button>
      {visibleItems.map((item, i) =>
        typeof item === "number" ? (
          <button
            key={`page-${item}`}
            className={page === item ? styles.active : ""}
            onClick={() => setPage(item)}
          >
            {item}
          </button>
        ) : (
          <span key={`${item}-${i}`} className={styles.ellipsis}>
            ...
          </span>
        ),
      )}
      <button
        disabled={page === totalPages}
        onClick={() => setPage((p) => p + 1)}
      >
        ▶
      </button>
    </div>
  );
};

export default Pagination;
