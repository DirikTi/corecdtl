import corecdtl from "../dist/index.js"

const web = corecdtl.createServer({
}).Web({
    spaRootPath: "./example/dist/index.html",
    publicStaticPath: "./example/dist/assets",
    publicStaticRoute: "assets"
});

web.listen(8080, undefined, undefined, () => {
    console.log("listenning");
});

web.listen(8080, "", )