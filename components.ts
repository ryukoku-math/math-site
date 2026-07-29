import { defineComponents } from "blume";
import SlideGallery from "./components/SlideGallery.astro";
import TitleClamp from "./components/TitleClamp.astro";

export default defineComponents({
  mdx: {
    SlideGallery,
    TitleClamp,
  },
});
