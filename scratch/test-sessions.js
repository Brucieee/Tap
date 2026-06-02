async function test() {
  const token = '2UaO0zyjIEeghXQca7747aa543e72c640391f95f4d9d91a25';
  try {
    const res = await fetch(`https://chrome.browserless.io/sessions?token=${token}`);
    console.log('Status code:', res.status);
    const json = await res.json();
    console.log('Sessions response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error fetching sessions:', err);
  }
}
test();
