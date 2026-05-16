import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseSlotDropdownDismissalInput = {
  openDropdownSlotId: string | null;
  setOpenDropdownSlotId: Dispatch<SetStateAction<string | null>>;
};

export function useSlotDropdownDismissal({
  openDropdownSlotId,
  setOpenDropdownSlotId,
}: UseSlotDropdownDismissalInput) {
  useEffect(() => {
    if (!openDropdownSlotId) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const dropdown = target.closest("[data-slot-dropdown]");
      if (dropdown?.getAttribute("data-slot-dropdown") !== openDropdownSlotId) {
        setOpenDropdownSlotId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdownSlotId(null);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openDropdownSlotId, setOpenDropdownSlotId]);
}
