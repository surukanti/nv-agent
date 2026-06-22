import { useState, useRef, useEffect, type RefObject } from 'react';

export function useDragDrop(ref: RefObject<HTMLElement | null>, onDrop: (file: File) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Use native event listeners to avoid React synthetic event issues with drag enter/leave
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (dragCounter.current === 1) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files) {
        for (const file of e.dataTransfer.files) {
          onDropRef.current(file);
        }
      }
    };

    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);

    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleDrop);
    };
  }, [ref]);

  return { isDragging };
}
