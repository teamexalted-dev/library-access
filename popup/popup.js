const libraryText = document.getElementById('library-status');
const unknownDecksSection = document.getElementById("unknown-decks");

const loading = (isLoading) => {
  if (isLoading) {
    libraryText.innerText = 'Loading';
    libraryText.classList.add('loading');
  } else {
    libraryText.innerText = 'Done';
    libraryText.classList.remove('loading');
  }
}

const loadLibrary = () => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    popupQuery: 'fetchLibrary'
  }, (library) => {
    resolve(library);
  })
})

const loadLibraryTco = () => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    popupQuery: 'fetchLibraryTco'
  }, (library) => {
    resolve(library);
  })
})
/*MASTER VAULT FUNCS*/

document.getElementById('access-master-vault').onclick = async (el) => {
  loading(true);
  const mvAuthCookie = await chrome.cookies.get({
      url: 'https://www.keyforgegame.com/',
      name: 'auth'
    });
  handleMasterVaultSync(mvAuthCookie);
}

const handleMasterVaultSync = async (cookie) => {
  if (!cookie) {
    alert('You must login to Master Vault first');
    loading(false);
    return;
  }

  const masterVaultUser = await getMasterVaultUser(cookie.value);
  const mvLibrary = await getMasterVaultLibrary(cookie.value, masterVaultUser, 1, document.getElementById('only-favorites').checked ? 1 : 0, [], 26);

  const libraryMin = mvLibrary.map(deck => deck.id);
  await chrome.runtime.sendMessage({
    popupQuery: 'saveLibrary',
    library: libraryMin
  });
  
  const libraryMinTco = mvLibrary.filter(deck => deck.expansion !== 479).map(deck => deck.id);
  await chrome.runtime.sendMessage({
    popupQuery: 'saveLibraryTco',
    library: libraryMinTco
  });

  loading(false);
  libraryText.innerText = `${libraryMin.length} decks accessed from Master Vault`;
}

const getMasterVaultUser = async (token) => {
  const response = await fetch('https://www.keyforgegame.com/api/users/self/', {
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'accept-language': 'en-us',
      authorization: `Token ${token}`,
      'x-authorization': `Token ${token}`
    }
  });
  const responseJson = await response.json();
  return responseJson.data;
}

const getMasterVaultLibrary = async (token, user, page, onlyFavorites, library, totalDecks) => {
  document.getElementById('load-status').innerText = `${totalDecks && totalDecks > page*25 ? (page-1)*25 : totalDecks} of ${totalDecks ? totalDecks : 0} decks`;
  const mvLibraryResultsPage = await fetch(`https://www.keyforgegame.com/api/users/${user.id}/decks/?page=${page}&page_size=25&search=&power_level=0,11&chains=0,24&only_favorites=${onlyFavorites}&ordering=-date`,
    {
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'accept-language': 'en-us',
        authorization: `Token ${token}`,
        'x-authorization': `Token ${token}`
      },
      method: 'GET'
    }
  );
  const mvLibraryResultsPageJson = await mvLibraryResultsPage.json();
  if(library.length + mvLibraryResultsPageJson.data.length != mvLibraryResultsPageJson.count) {
    return await getMasterVaultLibrary(token, user, ++page, onlyFavorites, library.concat(mvLibraryResultsPageJson.data), mvLibraryResultsPageJson.count);
  } else {
    return library.concat(mvLibraryResultsPageJson.data);
  }
}

/*MASTER VAULT FUNCS*/

/*DoK FUNCS*/

document.getElementById('sync-dok').onclick = async (el) => {
  loading(true);
  const activeTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  const wrappedAuthToken = await chrome.tabs.executeScript(activeTabs[0].id, {code: 'localStorage["AUTH"];'});
  handleDokSync(wrappedAuthToken[0]);
}



const handleDokSync = async (token) => {
  if (!token) {
    alert('You must login to Decks of KeyForge first');
    loading(false);
    return;
  }

  const library = await loadLibrary();
  if (!library || library.length == 0) {
    alert('No decks accessed from Master Vault. Click "Access Master Vault" first.');
    loading(false);
    return;
  } else {
    const dokDecks = await getDokLibrary(token);
    let imported = 0;

    for (let index = 0; index < library.length; index++) {
      if(!dokDecks.includes(library[index])){
        await importDeckDok(token, library[index]);
        ++imported;
      }
    }

    const dokOnlyDecks =[];
    for (let index = 0; index < dokDecks.length; index++) {
      if(!library.includes(dokDecks[index])){
        dokOnlyDecks.push(dokDecks[index]);
      }
    }

    if(dokOnlyDecks.length > 0) {
      unknownDecksSection.classList.remove('display-none');
      document.getElementById("show-unknown-decks").onclick = async (el) => {
        const tab = await chrome.tabs.create({url: "../unknown-decks/unknown.html", active: false});

        function tabUpdatedHandler (tabId, info) {
          if(tabId == tab.id && info.status == 'complete') {
            chrome.tabs.sendMessage(tab.id, {"unknown-decks": dokOnlyDecks});
            chrome.tabs.onUpdated.removeListener(tabUpdatedHandler);
            chrome.tabs.update(tabId, {active: true});
          }
        };

        chrome.tabs.onUpdated.addListener(tabUpdatedHandler);
      }

      const extraInfo = document.getElementById('extra-info');
      extraInfo.innerText = `Found ${dokOnlyDecks.length} decks in DoK not in MV`;
    }

    loading(false);
    libraryText.innerText = `Synced ${imported} decks`;
  }
}



const getDokLibrary = async (token) => {
  const dokDeckList = await fetch("https://decksofkeyforge.com/public-api/v1/my-deck-ids", {
    "credentials": "include",
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,da;q=0.8",
      "authorization": token,
      "cache-control": "no-cache",
      "content-type": "application/json;charset=UTF-8",
      "pragma": "no-cache",
      "timezone": "-240"
    },
    "method": "GET",
  });
  return dokDeckList.json();
}

const importDeckDok = async (token, deckId) => {
  const response = await fetch(
    `https://decksofkeyforge.com/api/decks/${deckId}/import-and-add`, {
      credentials: 'include',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9,da;q=0.8',
        authorization: token,
        timezone: '-240'
      },
      method: 'POST'
    });
  console.log(`Import ${deckId}`, response);
}

/*DoK FUNCS*/

/*TCO FUNCS*/

document.getElementById('sync-crucible').onclick = (el) => {
  loading(true)
  chrome.tabs.query({
      active: true,
      currentWindow: true
    }, (tabs) =>
    chrome.tabs.executeScript(
      tabs[0].id, {
        code: 'localStorage["refreshToken"];'
      },
      (response) => {
        handleCrucibleSync(response[0])
      }
    ))
}

const handleCrucibleSync = (user) => loadLibraryTco().then((library) => {
  if (!user) {
    alert('You must login to The Crucible Online first')
    loading(false)
    return
  }

  user = JSON.parse(user)

  if (!library || library.length == 0) {
    alert(
      'No decks accessed from Master Vault. Click "Access Master Vault" first.'
    )
    loading(false)
    return
  } else {
    fetch("https://thecrucible.online/api/account/token", {
        "credentials": "include",
        "headers": {
          "accept": "*/*",
          "accept-language": "en-US,en;q=0.9,da;q=0.8",
          "cache-control": "no-cache",
          "content-type": "application/json",
          "pragma": "no-cache",
          "x-requested-with": "XMLHttpRequest"
        },
        "referrer": "https://thecrucible.online/decks",
        "referrerPolicy": "no-referrer-when-downgrade",
        "body": JSON.stringify({
          'token': user
        }),
        "method": "POST",
        "mode": "cors"
      })
      .then((response) => response.json())
      .then((response) => {
        let token = response.token
        getCrucibleLibrary(token, user).then((crucibleLibrary) => {
          crucibleLibraryMin = []
          crucibleLibrary.forEach(deck => {
            crucibleLibraryMin.push(deck.uuid)
          })

          let imported = 0
          library.forEach(deckId => {
            if (!crucibleLibraryMin.includes(deckId)) {
              importDeckCrucible(token, deckId)
              imported = imported + 1
            }
          })

          loading(false)
          libraryText.innerText = `Synced ${imported} decks`
        })
      })
  }
})

const getCrucibleLibrary = (token, user, page, library) => new Promise((resolve, reject) => {
  fetch(`https://thecrucible.online/api/decks?pageSize=10000&page=1`, {
      "credentials": "include",
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,da;q=0.8",
        "authorization": `Bearer ${token}`,
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache",
        "x-requested-with": "XMLHttpRequest"
      },
      "method": "GET",
    })
    .then((response) => response.json())
    .then((response) => resolve(response.decks))
})

const importDeckCrucible = (token, deckId) => {
  fetch("https://thecrucible.online/api/decks/", {
    "credentials": "include",
    "headers": {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9,da;q=0.8",
      "authorization": `Bearer ${token}`,
      "cache-control": "no-cache",
      "content-type": "application/json",
      "pragma": "no-cache",
      "x-requested-with": "XMLHttpRequest",
    },
    "referrer": "https://thecrucible.online/decks/import",
    "referrerPolicy": "no-referrer-when-downgrade",
    "body": JSON.stringify({
      "uuid": deckId
    }),
    "method": "POST",
  }).then((response) => console.log(`Import ${deckId}`, response))
}

/*TCO FUNCS*/

chrome.tabs.getSelected(null, (tab) => {
  const masterVaultSection = document.getElementById('master-vault-section');
  const dokSection = document.getElementById('dok-section');
  const crucibleSection = document.getElementById('crucible-section');
  
  const tabUrl = tab.url;

  if (tabUrl.includes('www.keyforgegame.com')) {
    masterVaultSection.classList.remove('display-none')
    dokSection.classList.add('display-none')
    crucibleSection.classList.add('display-none')
    unknownDecksSection.classList.add('display-none')
  } else if (tabUrl.includes('decksofkeyforge.com')) {
    dokSection.classList.remove('display-none')
    masterVaultSection.classList.add('display-none')
    crucibleSection.classList.add('display-none')
    unknownDecksSection.classList.add('display-none')
  } else if (tabUrl.includes('thecrucible.online')) {
    crucibleSection.classList.remove('display-none')
    masterVaultSection.classList.add('display-none')
    dokSection.classList.add('display-none')
    unknownDecksSection.classList.add('display-none')
  }
})

loadLibrary().then((library) => {
  if (!library || library.length == 0) {
    libraryText.innerText = 'No decks accessed from Master Vault';
  } else {
    libraryText.innerText = `${library.length} decks accessed from Master Vault`;
  }
})