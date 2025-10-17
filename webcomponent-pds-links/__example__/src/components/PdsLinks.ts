type Contact = {
    url: string;
    platform?: string;
}
type Card = {
    name: string;
    contacts: Contact[];
};

type Collections = {
    cursor: string | undefined;
    records: {
        cid: string;
        uri: string;
        value: Card
    }[];
}

class PdsLinks extends HTMLElement {
    static observedAttributes = ["did", "pds-url"];

    constructor() {
        super();
    }

    updateContacts(card: Card) {
        const template = this.querySelector("template");
        console.log(template);
        if (!template) {
            return;
        }
        const contactElements = card.contacts.map(contact => {
            const contactElement = template?.content.firstElementChild?.cloneNode(true) as HTMLLIElement;
            const linkElement = contactElement.querySelector("a")!;
            linkElement.href = contact.url;
            linkElement.dataset.platform = contact.platform;
            linkElement.innerText = contact.url;
            return contactElement;
        });
            console.log(contactElements);
        this.replaceChildren(template, ...contactElements);
    }

    async connectedCallback() {
        const did = this.getAttribute("did")!;
        const pdsUrl = this.getAttribute("pds-url")!;
        const getRecordsEndpoint = new URL("/xrpc/com.atproto.repo.listRecords", pdsUrl);
        getRecordsEndpoint.searchParams.set("repo", did);
        getRecordsEndpoint.searchParams.set("collection", "com.fujocoded.rolodex.card");

        const collectionsResponse = await fetch(getRecordsEndpoint);
        if (collectionsResponse.ok) {
            const collections = await collectionsResponse.json();
            console.log(collections);
            this.updateContacts((collections as unknown as Collections).records[0].value)
        }
    }

    // attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    //     console.log(name, oldValue, newValue)
    // }
}


customElements.define("atfujo-links", PdsLinks)