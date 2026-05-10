async function sendMessage(){

  const input =
    document.getElementById("user-input");

  const message =
    input.value.trim();

  if(!message) return;

  addMessage(message,"user");

  input.value = "";

  showTyping();

  const response = await fetch(
    "http://localhost:3000/chat",
    {
      method:"POST",

      headers:{
        "Content-Type":"application/json"
      },

      body:JSON.stringify({
        message
      })
    }
  );

  const data =
    await response.json();

  setTimeout(()=>{

    removeTyping();

    addMessage(data.reply,"bot");

  },1000);
}

function addMessage(text,sender){

  const chatBox =
    document.getElementById("chat-box");

  const div =
    document.createElement("div");

  div.classList.add("message");
  div.classList.add(sender);

  const now =
    new Date();

  const time =
    now.getHours().toString().padStart(2,"0")
    + ":" +
    now.getMinutes().toString().padStart(2,"0");

  div.innerHTML = `
    <div class="message-text">
      ${text}
    </div>

    <div class="time">
      ${time}
    </div>
  `;

  chatBox.appendChild(div);

  smoothScroll();
}

function quickMessage(text){

  document.getElementById(
    "user-input"
  ).value = text;

  sendMessage();
}

function showTyping(){

  const chatBox =
    document.getElementById("chat-box");

  const typing =
    document.createElement("div");

  typing.classList.add("typing");

  typing.id = "typing";

  typing.innerHTML =
    "Restaurant is typing...";

  chatBox.appendChild(typing);

  smoothScroll();
}

function removeTyping(){

  const typing =
    document.getElementById("typing");

  if(typing){
    typing.remove();
  }
}

function smoothScroll(){

  const chatBox =
    document.getElementById("chat-box");

  chatBox.scrollTo({
    top:chatBox.scrollHeight,
    behavior:"smooth"
  });
}

document
  .getElementById("user-input")
  .addEventListener(
    "keypress",
    function(event){

      if(event.key === "Enter"){
        sendMessage();
      }

});