import { createContext, useContext, useState } from "react";

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

  const screenToBoard = (screenX, screenY) => {
    const boardX = (screenX - pan.x) / zoom - BOARD_WIDTH / 2;
    const boardY = (screenY - pan.y) / zoom - BOARD_HEIGHT / 2;
    return { x: Math.round(boardX), y: Math.round(boardY) };
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <BoardContext.Provider
      value={{
        zoom,
        setZoom,
        pan,
        setPan,
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
