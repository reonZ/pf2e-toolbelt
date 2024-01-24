export async function roll3dDice(roll, user = game.user, synchronize = true){
    // if DSN is active and doesn't display chat card immediately, delay until the roll is done
    if(game.modules.get('dice-so-nice')?.active){
        let dsnRoll = game.dice3d.showForRoll(roll, user, synchronize);
        if(!game.settings.get("dice-so-nice", "immediatelyDisplayChatMessages")){
            return dsnRoll;
        } 
    }
    return Promise.resolve(true);
}