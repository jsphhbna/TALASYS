export function describeDataLoadError(error: string, hasData: boolean) {
  return {
    title: hasData ? "Some data could not be refreshed" : "Data failed to load",
    detail: `${error}${hasData ? " Previously loaded sources remain visible." : ""}`,
  }
}
