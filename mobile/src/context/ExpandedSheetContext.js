import React, { createContext, useContext } from 'react';

export const ExpandedSheetContext = createContext({
  expanded: false,
  isExpanded: false,
  setExpanded: () => {},
});

export function useExpandedSheet() {
  return useContext(ExpandedSheetContext);
}

export default ExpandedSheetContext;
