import { useId, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useLanguage } from "../context.js";
import { BAR_HEIGHT, COLORS, MOTION, PHONE, RADIUS, SHADOW, TYPE, WORKSPACE } from "../theme.js";
import { Box, visuallyHidden } from "../ui/index.js";
import { useWidgetRef, useWorkspace } from "./workspace-context.js";

/**
 * The widget that holds what the user types or picks, floating at the top
 * left of the workspace map (spec 6.2); on phones it is the body of the
 * bottom sheet (6.3). Its header carries the tool title (the page's h1) and
 * a collapse button; collapsed it is only its header. The body scrolls
 * inside the widget, which never grows over the result widget. A workspace
 * tool renders exactly one, next to its ResultHud.
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   icon?: string,
 *   actions?: import("react").ReactNode,
 *   children: import("react").ReactNode,
 * }} props
 *   icon is an Icon name shown before the title; actions are buttons in a
 *   row at the foot of the widget, outside its scrolling body (e.g. swap,
 *   clear).
 */
export default function InputWidget({ title, subtitle, icon, actions, children }) {
  const { text } = useLanguage();
  const { expanded } = useWorkspace();
  const widgetRef = useWidgetRef("input");
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const toggleLabel = collapsed ? text.showPanel : text.hidePanel;

  return (
    <>
      {/* While the map is enlarged the widget is hidden; the page keeps its h1. */}
      {expanded && (
        <Box component="h1" sx={visuallyHidden}>
          {title}
        </Box>
      )}
      <Box
        component="section"
        ref={widgetRef}
        data-widget="input"
        aria-labelledby="tool-title"
        sx={{
          position: "absolute",
          top: BAR_HEIGHT + WORKSPACE.inset,
          left: WORKSPACE.inset,
          width: WORKSPACE.inputWidth,
          maxHeight: `var(--input-max, calc(100% - ${BAR_HEIGHT + 2 * WORKSPACE.inset + 180}px))`,
          display: expanded ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: `1px solid ${COLORS.rule}`,
          borderRadius: `${RADIUS.widget}px`,
          bgcolor: COLORS.sheet,
          boxShadow: SHADOW.float,
          pointerEvents: "auto",
          [PHONE]: {
            position: "static",
            order: 0,
            flex: "none",
            width: "auto",
            maxHeight: "none",
            overflow: "visible",
            border: 0,
            borderRadius: 0,
            bgcolor: "transparent",
            boxShadow: "none",
          },
        }}
      >
        <Box
          component="header"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flex: "none",
            minHeight: 44,
            pl: 1.5,
            pr: 0.5,
            borderBottom: collapsed ? 0 : `1px solid ${COLORS.rule}`,
            color: COLORS.ink,
            "& > svg": { color: COLORS.ink2 },
            [PHONE]: { minHeight: 44, pr: 2, borderBottom: 0 },
          }}
        >
          {icon && <Box sx={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 1, bgcolor: COLORS.aSoft, color: COLORS.aInk }}><Icon name={icon} size={16} /></Box>}
          <Box sx={{ flex: 1, minWidth: 0, py: 1 }}>
          <Box
            component="h1"
            id="tool-title"
            sx={{
              flex: 1,
              minWidth: 0,
              m: 0,
              fontSize: 15,
              fontWeight: 650,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Box>
          {subtitle && <Box component="p" sx={{ m: 0, mt: 0.25, fontSize: TYPE.meta, lineHeight: 1.3, color: COLORS.muted }}>{subtitle}</Box>}
          </Box>
          <Box
            component="button"
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={toggleLabel}
            title={toggleLabel}
            sx={{
              display: "grid",
              placeItems: "center",
              flex: "none",
              width: 36,
              height: 36,
              border: 0,
              borderRadius: `${RADIUS.control}px`,
              bgcolor: "transparent",
              color: COLORS.ink2,
              cursor: "pointer",
              transition: `background-color ${MOTION.fast} ${MOTION.ease}`,
              "&:hover": { bgcolor: COLORS.paper2, color: COLORS.ink },
              "& > svg": { transform: collapsed ? "none" : "rotate(180deg)", transition: `transform ${MOTION.base} ${MOTION.ease}` },
              [PHONE]: { display: "none" },
            }}
          >
            <Icon name="chevron" size={18} />
          </Box>
        </Box>
        <Box
          id={contentId}
          sx={{
            display: collapsed ? "none" : "flex",
            flexDirection: "column",
            flex: "1 1 auto",
            minHeight: 0,
            [PHONE]: { display: "flex", flex: "none" },
          }}
        >
          <Box
            sx={{
              // The containing block of hidden live regions inside, so they stay in the scroller.
              position: "relative",
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
              // The gutter is kept even without a scrollbar, so the content never
              // reflows (and grows) when one appears; thin, so it takes little room.
              scrollbarWidth: "thin",
              scrollbarGutter: "stable",
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 1.5,
              [PHONE]: { flex: "none", overflow: "visible", px: 2, pt: 0.5 },
            }}
          >
            {children}
          </Box>
          {actions && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 1,
                flex: "none",
                px: 1.25,
                py: 0.75,
                borderTop: `1px solid ${COLORS.rule}`,
                bgcolor: COLORS.paper,
                "& .MuiButton-root": { whiteSpace: "nowrap" },
                "& .MuiButton-startIcon": { mr: "6px" },
                [PHONE]: { px: 2, py: 1, borderTop: `1px solid ${COLORS.rule}` },
              }}
            >
              {actions}
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
