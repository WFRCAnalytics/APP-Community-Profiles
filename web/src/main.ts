import "@fontsource-variable/inter";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

mount(App, { target: document.getElementById("app")! });
