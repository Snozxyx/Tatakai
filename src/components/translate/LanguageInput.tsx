import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

// Suggestions, not a provider capability claim. Custom BCP-47 language/script
// tags remain editable for local and hosted models with different capabilities.
const codes = "af am ar az be bg bn bs ca cs cy da de el en es et eu fa fi fil fr ga gl gu he hi hr hu hy id is it ja ka kk km kn ko lo lt lv mk ml mn mr ms mt my ne nl no pa pl ps pt ro ru si sk sl sq sr sv sw ta te th tr uk ur uz vi zh zu".split(" ");
const names = new Intl.DisplayNames(["en"], { type: "language" });
export function LanguageInput(props: ComponentProps<typeof Input>) {
  const list = `${props.id}-languages`;
  return <>
    <Input {...props} list={list} />
    <datalist id={list}>
      {codes.map(code => <option key={code} value={code}>{names.of(code)}</option>)}
    </datalist>
  </>;
}
