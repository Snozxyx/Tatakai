const res = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } episodes } }`,
    variables: { id: 151807 },
  }),
});
console.log(JSON.stringify(await res.json(), null, 2));
