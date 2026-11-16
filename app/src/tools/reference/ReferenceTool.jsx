import { useEffect } from "react";
import DataList, { DataRow } from "../../components/DataList.jsx";
import { fill, useConfig, useLanguage } from "../../context.js";
import { sectionOf } from "../../lib/address.js";
import { groupedDecimal } from "../../lib/locale-decimal.js";
import PageLayout from "../../shell/PageLayout.jsx";
import { COLORS, LABEL_CAPS, MONO_FONT, PHONE, RADIUS, TYPE } from "../../theme.js";
import { Box, Paper } from "../../ui/index.js";
import { REFERENCE_SECTIONS, accuracyRows, crsRows, errorRows, unitRows, wgs84Rows } from "./reference.js";

const anchorOf = (section) => `reference-${section}`;

/** Scrolls to a section and moves focus there. */
function showSection(section) {
  const target = document.getElementById(anchorOf(section));
  if (target == null) return;
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}

/**
 * An index link: "#reference/<section>", which opens this page at the
 * section in a new tab; a plain click moves there in place.
 */
function goTo(event, section) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.replaceState(null, "", `#reference/${section}`);
  showSection(section);
}

function Section({ id, title, note, children }) {
  return (
    <Paper
      component="section"
      id={anchorOf(id)}
      tabIndex={-1}
      aria-labelledby={`${anchorOf(id)}-title`}
      sx={{ p: 3, scrollMarginTop: 72, outline: "none", [PHONE]: { p: 2 } }}
    >
      <Box
        component="h2"
        id={`${anchorOf(id)}-title`}
        sx={{ m: 0, color: COLORS.ink, fontSize: TYPE.title, fontWeight: 650, lineHeight: 1.35 }}
      >
        {title}
      </Box>
      {note && (
        <Box component="p" sx={{ m: 0, mt: 0.5, mb: 1, color: COLORS.muted, fontSize: TYPE.small, lineHeight: 1.5 }}>
          {note}
        </Box>
      )}
      <Box sx={{ mt: note ? 0 : 1 }}>{children}</Box>
    </Paper>
  );
}

/** Referans (spec 8.6): accuracy, WGS 84, coordinate systems, units and error codes, with an in-page index. */
export default function ReferenceTool() {
  const { text, language, units, errors } = useLanguage();
  const { reference: settings } = useConfig();

  // Opened as "#reference/<section>", or that address typed while the page is
  // open: go to that section.
  useEffect(() => {
    const fromHash = () => {
      const section = sectionOf(window.location.hash.slice(1));
      if (REFERENCE_SECTIONS.includes(section)) showSection(section);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const titles = {
    accuracy: text.referenceAccuracy,
    wgs84: text.referenceWgs84,
    crs: text.supportedSystems,
    units: text.referenceUnits,
    errors: text.referenceErrors,
  };
  const accuracyLabels = {
    "utm-ups": text.accuracyUtmUps,
    mgrs: text.accuracyMgrs,
    "epsg-grids": text.accuracyEpsgGrids,
    "web-mercator": text.accuracyWebMercator,
    geodesic: text.accuracyGeodesic,
    "gars-georef": text.accuracyGarsGeoref,
  };
  // The README names this reference in Turkish; it is translated here.
  const accuracyReferences = { "web-mercator": text.accuracyFormula };
  const wgs84Labels = {
    a: text.wgs84A,
    b: text.wgs84B,
    f: text.wgs84F,
    inverseFlattening: text.wgs84InverseF,
    utmScale: text.wgs84UtmScale,
    upsScale: text.wgs84UpsScale,
  };
  const kindLabels = {
    geographic: text.crsKindGeographic,
    webMercator: text.crsKindWebMercator,
    utmNorth: text.crsKindUtmNorth,
    utmSouth: text.crsKindUtmSouth,
    upsNorth: text.crsKindUpsNorth,
    upsSouth: text.crsKindUpsSouth,
  };

  return (
    <PageLayout title={text.referenceTitle} subtitle={text.referenceSubtitle}>
      <Box component="nav" aria-label={text.referenceIndex} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={{ mr: 0.5, color: COLORS.muted, ...LABEL_CAPS }}
        >
          {text.referenceIndex}
        </Box>
        {REFERENCE_SECTIONS.map((section) => (
          <Box
            key={section}
            component="a"
            href={`#reference/${section}`}
            onClick={(event) => goTo(event, section)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 32,
              px: 1.5,
              border: `1px solid ${COLORS.rule}`,
              borderRadius: `${RADIUS.pill}px`,
              color: COLORS.ink,
              fontSize: TYPE.small,
              textDecoration: "none",
              "&:hover": { borderColor: COLORS.rule2 },
              [PHONE]: { minHeight: 40 },
            }}
          >
            {titles[section]}
          </Box>
        ))}
      </Box>

      <Section id="accuracy" title={titles.accuracy} note={text.referenceAccuracyNote}>
        <DataList>
          {accuracyRows(settings.accuracy, language).map((row) => (
            <DataRow
              key={row.id}
              label={accuracyLabels[row.id] ?? row.id}
              value={row.difference}
              note={fill(text.accuracyAgainst, { reference: accuracyReferences[row.id] ?? row.reference })}
            />
          ))}
        </DataList>
      </Section>

      <Section id="wgs84" title={titles.wgs84}>
        <DataList>
          {wgs84Rows().map((row) => (
            <DataRow key={row.id} label={wgs84Labels[row.id]} symbol={row.symbol} value={groupedDecimal(row.value, language)} unit={row.unit} copyValue={row.value} />
          ))}
        </DataList>
      </Section>

      <Section id="crs" title={titles.crs} note={text.axisNote}>
        <DataList>
          {crsRows().map((row) => (
            <DataRow key={row.code} label={kindLabels[row.kind] ?? row.code} value={row.code} />
          ))}
        </DataList>
      </Section>

      <Section id="units" title={titles.units} note={text.referenceUnitsNote}>
        <DataList>
          {unitRows().map((row) => (
            <DataRow
              key={row.id}
              label={units[row.id] ?? row.label}
              symbol={row.symbol}
              value={groupedDecimal(row.metres, language)}
              unit="m"
              copyValue={row.metres}
            />
          ))}
        </DataList>
      </Section>

      <Section id="errors" title={titles.errors} note={text.referenceErrorsNote}>
        <DataList>
          {errorRows(errors).map((row) => (
            <DataRow key={row.code} label={row.text} value={<Box component="code" sx={{ fontFamily: MONO_FONT, fontSize: TYPE.small }}>{row.code}</Box>} />
          ))}
        </DataList>
      </Section>
    </PageLayout>
  );
}
