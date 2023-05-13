async function load(url: string): Promise<ArrayBuffer> {
  return fetch(url).then((response) => response.arrayBuffer())
}

const Fetcher = {
  load,
}

export default Fetcher
