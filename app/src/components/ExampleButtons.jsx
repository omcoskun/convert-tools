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
      sx={{ mt: 2 }}
    >
      <Typography variant="body2" color="text.secondary">
        {text.examples}
      </Typography>
      {items.map((item) => (
        <Button key={item.key} size="small" variant="outlined" onClick={item.onClick}>
          {item.label}
        </Button>
      ))}
    </Stack>
  );
}
