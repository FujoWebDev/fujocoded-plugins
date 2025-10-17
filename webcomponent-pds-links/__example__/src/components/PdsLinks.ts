import {
  SocialLinks,
  type SocialLinksData,
} from "@fujocoded/zod-transform-socials";
import { IdResolver } from "@atproto/identity";

const IDENTITY_RESOLVER = new IdResolver({});

export const getDid = async ({ didOrHandle }: { didOrHandle: string }) => {
  if (didOrHandle.startsWith("did:")) {
    return didOrHandle;
  }
  return await IDENTITY_RESOLVER.handle.resolve(didOrHandle);
};

export const getPdsUrl = async ({ didOrHandle }: { didOrHandle: string }) => {
  const did = await getDid({ didOrHandle });
  if (!did) {
    throw new Error(`Did not resolve to a valid DID: ${didOrHandle}`);
  }
  const atprotoData = await IDENTITY_RESOLVER.did.resolveAtprotoData(did);
  return atprotoData.pds;
};

type Contact = {
  url: string;
  platform?: string;
};
type Card = {
  name: string;
  contacts: Contact[];
};

type Collections = {
  cursor: string | undefined;
  records: {
    cid: string;
    uri: string;
    value: Card;
  }[];
};

class PdsLinks extends HTMLElement {
  static observedAttributes = ["did", "handle", "at-identifier"];

  constructor() {
    super();
  }

  async getPdsData() {
    const userId =
      this.getAttribute("did") ??
      this.getAttribute("handle") ??
      this.getAttribute("at-identifier");
    if (!userId) {
      throw new Error("Couldn't find a valid UserId");
    }
    const did = await getDid({ didOrHandle: userId });
    return {
      did: did!,
      url: await getPdsUrl({ didOrHandle: userId }),
    };
  }

  /**
   * Returns the element with the given tag from the given parent, or
   * creates and appends it if there's none.
   *
   * Additionally, if no parent is given, return that Element in the template,
   * or make the given one as a new root and append it.
   */
  getOrCreateElement<T extends HTMLElement>(
    elementTag: keyof HTMLElementTagNameMap,
    parent?: HTMLElement
  ): T {
    if (!parent) {
      const template = this.querySelector("template")?.content.cloneNode(
        true
      ) as DocumentFragment | undefined;
      if (template?.querySelector(elementTag)) {
        const newTag = this.appendChild(template.querySelector(elementTag)!)
        return newTag as T;
      }
    } else {
      const innerElement = parent.querySelector(elementTag);
      if (innerElement) {
        return innerElement as T;
      }
    }
    const newElement = document.createElement(elementTag) as T;
    (parent ?? this).appendChild(newElement);
    return newElement;
  }

  getInnerLinkText(contact: SocialLinksData[number]) {
    const name =
      contact.username ??
      contact.url.replace("http://", "").replace("https://", "");
    return name.endsWith("/") ? name.substring(0, name.length - 1) : name;
  }

  getIcon(contact: SocialLinksData[number]) {
    if (contact.icon?.startsWith("simple-icons:")) {
      const iconName = contact.icon.replace("simple-icons:", "");
      return `https://cdn.simpleicons.org/${iconName}`;
    }

    if (contact.icon == "favicon") {
      return new URL("/favicon/favicon-32x32.png", contact.url).href;
    }
  }

  updateContacts(card: Card) {
    const contactElements = SocialLinks.parse(card.contacts).map((contact) => {
      const contactElement = this.getOrCreateElement<HTMLLIElement>("li");
      const linkElement = this.getOrCreateElement<HTMLAnchorElement>(
        "a",
        contactElement
      );

      linkElement.href = contact.url;
      linkElement.dataset.platform = contact.platform;
      linkElement.innerText = this.getInnerLinkText(contact);

      const iconUrl = this.getIcon(contact);
      if (iconUrl) {
      contactElement.dataset.icon = iconUrl;
      contactElement.style.setProperty("--icon-url", `url(${iconUrl})`)
      }

      return contactElement;
    });
    const root = this.getOrCreateElement("ul");
    root.replaceChildren(this.querySelector("template") ?? "", ...contactElements);
  }

  async connectedCallback() {
    // As soon as we latch in, we go get the data from the PDS
    const pdsData = await this.getPdsData();

    const getRecordsEndpoint = new URL(
      "/xrpc/com.atproto.repo.listRecords",
      pdsData.url
    );
    getRecordsEndpoint.searchParams.set("repo", pdsData.did);
    getRecordsEndpoint.searchParams.set(
      "collection",
      "com.fujocoded.rolodex.card"
    );

    const collectionsResponse = await fetch(getRecordsEndpoint);
    if (collectionsResponse.ok) {
      const collections = await collectionsResponse.json();
      this.updateContacts(
        (collections as unknown as Collections).records[0].value
      );
    }
  }
}

customElements.define("atfujo-links", PdsLinks);
