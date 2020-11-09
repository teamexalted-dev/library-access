console.log("adding listener");
chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        console.log(`listener hit with ${JSON.stringify(request)}`);
        if(request["unknown-decks"]) {
            
            console.log(JSON.stringify(request["unknown-decks"]));
            
            const unknownDecksSection = document.getElementById("unknown-decks");

            request["unknown-decks"].forEach((deck) => {
              const anchor = document.createElement("a");
              anchor.href = `https://decksofkeyforge.com/decks/${deck}`;
              anchor.target = "_blank";
              const anchorText = document.createTextNode(deck);
              anchor.appendChild(anchorText);
              unknownDecksSection.appendChild(anchor);
            });

            sendResponse(true);
        }
    });