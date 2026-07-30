import { defineComponents } from "blume";
import Header from "./components/Header.astro";
import SlideGallery from "./components/SlideGallery.astro";
import TitleClamp from "./components/TitleClamp.astro";

export default defineComponents({
  mdx: {
    SlideGallery,
    TitleClamp,
  },
  layout: {
    Header,
  },
});
