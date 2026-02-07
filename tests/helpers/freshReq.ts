export function freshReqObj() {
  return {
    retFlag: 0,
    mainOffset: 0,
    headerSize: 0,
    headers: {} as Record<string, string | undefined>,
    method: 0,
    params: [],
    query: {},
  };
}
