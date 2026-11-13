// Build-time values embedded by webpack's DefinePlugin (see webpack.config.js).

/**
 * The team's build variant: "hap", "hwf" or null when IWC was not set.
 * Nothing in the demo depends on it yet; it is exposed as
 * <html data-iwc="..."> so a build can be identified.
 * @type {"hap" | "hwf" | null}
 */
export const IWC = process.env.IWC || null;
