const ORIGIN = "drive-tr.onrender.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = ORIGIN;
    url.protocol = "https:";
    return fetch(url.toString(), request);
  },
};
