/** Old host → https://tr.rojiura.app/drive/… */
const TARGET = "https://tr.rojiura.app";
const BASE = "/drive";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const withCode = pathname.match(/^\/([rd])\/([^/]+)\/?$/i);
    if (withCode) {
      const dest = new URL(`${TARGET}${BASE}/${withCode[1].toLowerCase()}/`);
      dest.searchParams.set("code", withCode[2]);
      url.searchParams.forEach((v, k) => {
        if (k !== "code") dest.searchParams.set(k, v);
      });
      return Response.redirect(dest.toString(), 301);
    }

    const roleOnly = pathname.match(/^\/([rd])\/?$/i);
    if (roleOnly) {
      const dest = new URL(`${TARGET}${BASE}/${roleOnly[1].toLowerCase()}/`);
      dest.search = url.search;
      return Response.redirect(dest.toString(), 301);
    }

    const rest = pathname === "" ? "/" : pathname;
    const dest = new URL(`${TARGET}${BASE}${rest === "/" ? "/" : rest}`);
    dest.search = url.search;
    return Response.redirect(dest.toString(), 301);
  },
};
