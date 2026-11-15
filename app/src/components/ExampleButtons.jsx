import { useLanguage } from "../context.js";
import { Button, Stack, Typography } from "../ui/index.js";

/** items: [{ key, label, onClick }] */
export default function ExampleButtons({ items }) {
  const { text } = useLanguage();
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      alignItems="center"
      aria-label={text.examples}
      sx={{ mt: 2.5 }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5, mr: 0.5 }}>
        {text.examples}
      </Typography>
      {/* Pills, as in the distance tool. */}
      {items.map((item) => (
        <Button key={item.key} size="small" variant="outlined" onClick={item.onClick} sx={{ borderRadius: 999, minHeight: 30, px: 1.5 }}>
          {item.label}
        </Button>
      ))}
    </Stack>
  );
}
