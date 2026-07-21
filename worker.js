// hyperterminal.clearevo.com is now just a 301 to the subfolder on the main site.
export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect(
      'https://www.clearevo.com/hyperterminal' + url.pathname + url.search, 301);
  },
};
