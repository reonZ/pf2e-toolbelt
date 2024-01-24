export async function roll3dDice(roll){
    // if DSN is active and doesn't display chat card immediately, delay until the roll is done
    if(game.modules.get('dice-so-nice')?.active){
        let dsnRoll = game.dice3d.showForRoll(roll);
        if(!game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages")){
            return dsnRoll;
        } 
    }
    return Promise.resolve(true);
}