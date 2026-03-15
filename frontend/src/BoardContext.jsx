import { createContext, useContext, useState, useRef } from "react";

const BoardContext = createContext();

export function BoardProvider({ children }) {
  const BOARD_WIDTH = 5000;
  const BOARD_HEIGHT = 5000;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({
    x: window.innerWidth / 2 - BOARD_WIDTH / 2,
    y: window.innerHeight / 2 - BOARD_HEIGHT / 2,
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isBoardInteractive, setIsBoardInteractive] = useState(true);

  // Exposed refs so consumers can read live values without React lag
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  // Any function registered here gets called synchronously inside applyTransform
  // — same call stack as the board's DOM update, zero lag guaranteed
  const transformListenerRef = useRef(null);

  const screenToBoard = (screenX, screenY) => {
    const boardX =
      (screenX - panRef.current.x) / zoomRef.current - BOARD_WIDTH / 2;
    const boardY =
      (screenY - panRef.current.y) / zoomRef.current - BOARD_HEIGHT / 2;
    return { x: Math.round(boardX), y: Math.round(boardY) };
  };

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  return (
    <BoardContext.Provider
      value={{
        zoom,
        setZoom,
        pan,
        setPan,
        zoomRef,
        panRef,
        transformListenerRef,
        BOARD_WIDTH,
        BOARD_HEIGHT,
        screenToBoard,
        refreshTrigger,
        triggerRefresh,
        isBoardInteractive,
        setIsBoardInteractive,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export const useBoard = () => useContext(BoardContext);
