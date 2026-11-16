import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DesktopApi } from "./desktop-api";

/**
 * Whether an HTML file preview opens with the page's scripts running. Off is
 * the default for untrusted code: the operator turns scripts on per page.
 *
 * The main window provides the live setting. Any other window (detached
 * files, sub-agent transcripts, changelog) has no provider, and the hook reads
 * the setting itself from the config projection.
 */
const HtmlPreviewRunScriptsContext = createContext<boolean | undefined>(undefined);

/**
 * Whether the page a Codex visualize directive names is drawn in the message.
 * Off leaves its file link alone. Provided and read like the setting above.
 */
const VisualizeDrawInChatContext = createContext<boolean | undefined>(undefined);

export function HtmlPreviewPreferencesProvider(props: {
  children: ReactNode;
  runScripts: boolean;
  /** Left out, the setting's default stands: drawn. */
  visualizeDrawInChat?: boolean;
}) {
  return (
    <HtmlPreviewRunScriptsContext.Provider value={props.runScripts}>
      <VisualizeDrawInChatContext.Provider value={props.visualizeDrawInChat ?? true}>
        {props.children}
      </VisualizeDrawInChatContext.Provider>
    </HtmlPreviewRunScriptsContext.Provider>
  );
}

/** The setting, or undefined until a window without a provider has read it. */
export function useVisualizeDrawInChat(
  desktopApi?: Pick<DesktopApi, "readConfigBootstrap">,
): boolean | undefined {
  const provided = useContext(VisualizeDrawInChatContext);
  const readConfigBootstrap = provided === undefined ? desktopApi?.readConfigBootstrap : undefined;
  // With nothing to read the setting from, its default stands.
  const [read, setRead] = useState<boolean | undefined>(readConfigBootstrap ? undefined : true);
  useEffect(() => {
    if (!readConfigBootstrap) return undefined;
    let cancelled = false;
    void readConfigBootstrap()
      .then((response) => {
        if (!cancelled) setRead(response.snapshot.visualizeDrawInChat ?? true);
      })
      .catch(() => {
        if (!cancelled) setRead(true);
      });
    return () => {
      cancelled = true;
    };
  }, [readConfigBootstrap]);
  return provided ?? read;
}

/** The setting, or false until a window without a provider has read it. */
export function useHtmlPreviewRunScripts(
  desktopApi?: Pick<DesktopApi, "readConfigBootstrap">,
): boolean {
  const provided = useContext(HtmlPreviewRunScriptsContext);
  const [read, setRead] = useState(false);
  const readConfigBootstrap = provided === undefined ? desktopApi?.readConfigBootstrap : undefined;
  useEffect(() => {
    if (!readConfigBootstrap) return undefined;
    let cancelled = false;
    void readConfigBootstrap()
      .then((response) => {
        if (!cancelled) setRead(response.snapshot.htmlPreviewRunScripts);
      })
      .catch(() => {
        // Keep the safe default.
      });
    return () => {
      cancelled = true;
    };
  }, [readConfigBootstrap]);
  return provided ?? read;
}
